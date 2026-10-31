// ============================================================
// Sahayak - Agent Loop State Machine (Slice 3.3 & Slice 3.4)
// Manages the one-step-at-a-time agent execution with:
// - Step limit enforcement (20 steps max)
// - Human approval / skip / stop / dry-run
// - Safety guardrails for credentials and sensitive actions
// - Persistence in chrome.storage.session
// ============================================================

import { callModel } from './model-router.js';
import { getProfile } from './storage-manager.js';
import { checkActionSafety, isBlockedDomain } from './safety.js';
import { buildActionMapPrompt } from './prompt-builder.js';

export const DEFAULT_STATE = {
  task: '',
  stepIndex: 0,
  stepLimit: 20,
  status: 'idle', // 'idle' | 'scanning' | 'planning' | 'awaiting_approval' | 'executing' | 'stopped' | 'done'
  pendingAction: null,
  pendingTargetDesc: '',
  requiresExtraConfirm: false,
  actionLog: [],
  elementSnapshot: [],
  tabId: null,
};

/**
 * Starts a new agent task from user input.
 */
export async function startAgentTask(task, tabId) {
  if (!task || !task.trim()) {
    throw new Error('Please enter a task description.');
  }

  const currentState = await loadAgentState();
  if (currentState.status === 'awaiting_approval' || currentState.status === 'planning') {
    throw new Error('An agent task is already in progress. Stop or approve the current action first.');
  }

  let tabObj = null;
  try {
    tabObj = await chrome.tabs.get(tabId);
  } catch {}
  if (tabObj && tabObj.url && isBlockedDomain(tabObj.url)) {
    throw new Error('Sahayak cannot run on banking or payment websites for your safety.');
  }

  await updateAgentState({
    task: task.trim(),
    stepIndex: 0,
    stepLimit: 20,
    status: 'scanning',
    pendingAction: null,
    pendingTargetDesc: '',
    requiresExtraConfirm: false,
    actionLog: [],
    elementSnapshot: [],
    tabId,
  });

  notifySidePanel({ type: 'AGENT_STARTED', task: task.trim() });
  await runNextStep(tabId);
}

/**
 * Executes a single planning iteration of the agent loop.
 */
export async function runNextStep(tabId) {
  const state = await loadAgentState();

  if (state.status === 'stopped' || state.status === 'done') {
    return;
  }

  // Check step limit (Slice 3.4)
  if (state.stepIndex >= state.stepLimit) {
    const doneState = await updateAgentState({ status: 'done', pendingAction: null });
    notifySidePanel({
      type: 'AGENT_DONE',
      message: `Step limit reached (${state.stepLimit} steps). Task stopped.`,
      data: doneState,
    });
    return;
  }

  await updateAgentState({ status: 'scanning' });
  notifySidePanel({ type: 'AGENT_STATUS', status: 'Scanning interactive elements...' });

  // 1. Scan elements from active page
  let scanRes = null;
  try {
    scanRes = await chrome.tabs.sendMessage(tabId, {
      type: 'SCAN_ELEMENTS',
      payload: { renderBadges: true },
    });
  } catch (err) {
    console.warn('[Sahayak Agent] Element scan failed:', err);
  }

  if (!scanRes || !scanRes.success || !scanRes.elements || scanRes.elements.length === 0) {
    const doneState = await updateAgentState({ status: 'done', pendingAction: null });
    notifySidePanel({
      type: 'AGENT_DONE',
      message: 'No interactive elements detected on the page to proceed.',
      data: doneState,
    });
    return;
  }

  await updateAgentState({
    status: 'planning',
    elementSnapshot: scanRes.elements,
  });
  notifySidePanel({ type: 'AGENT_STATUS', status: 'Planning next action with AI...' });

  // 2. Generate Plan with AI
  const profile = await getProfile();
  const prompt = buildActionMapPrompt(scanRes.actionMapText, state.task, state.actionLog, profile);
  let rawAi = '';
  try {
    rawAi = await callModel({ prompt, model: 'flash' });
  } catch (err) {
    notifySidePanel({ type: 'AGENT_ERROR', error: 'AI model planning failed: ' + err.message });
    await updateAgentState({ status: 'stopped' });
    return;
  }

  // 3. Validate AI Action
  let action = null;
  try {
    action = validateAgentAction(rawAi);
  } catch (err) {
    notifySidePanel({ type: 'AGENT_ERROR', error: err.message });
    await updateAgentState({ status: 'stopped' });
    return;
  }

  // 4. Repetitive Loop Detection (Edge case 15.2)
  const history = state.actionLog || [];
  if (history.length >= 2) {
    const prev1 = history[history.length - 1];
    const prev2 = history[history.length - 2];
    if (
      prev1.action === action.action &&
      prev1.element === action.element &&
      prev2.action === action.action &&
      prev2.element === action.element
    ) {
      await updateAgentState({ status: 'stopped' });
      notifySidePanel({
        type: 'AGENT_BLOCKED',
        reason: 'Detected a repetitive loop on element [' + action.element + ']. Paused for user safety.',
      });
      return;
    }
  }

  // 5. Safety Guardrails Check (Slice 3.4 & Section 21)
  let tabUrl = '';
  try {
    const tabObj = await chrome.tabs.get(tabId);
    tabUrl = tabObj?.url || '';
  } catch {}
  const safety = checkActionSafety(action, scanRes.elements, tabUrl);
  if (!safety.allowed) {
    await updateAgentState({ status: 'stopped' });
    notifySidePanel({ type: 'AGENT_BLOCKED', reason: safety.reason });
    return;
  }

  // 6. Handle "done" action from AI
  if (action.action === 'done') {
    const logEntry = {
      step: state.stepIndex + 1,
      ...action,
      decision: 'completed',
    };
    const finalState = await updateAgentState({
      status: 'done',
      pendingAction: null,
      actionLog: [...state.actionLog, logEntry],
    });
    notifySidePanel({
      type: 'AGENT_DONE',
      message: action.reason || 'Task marked as completed by Sahayak!',
      data: finalState,
    });
    return;
  }

  // 7. Highlight the proposed element on the live webpage
  if (action.element) {
    chrome.tabs.sendMessage(tabId, {
      type: 'HIGHLIGHT_ELEMENT',
      elementId: action.element,
    }).catch(() => {});
  }

  // Target label for card display
  const targetMeta = scanRes.elements.find((e) => e.id === action.element);
  const targetDesc = targetMeta
    ? `[${targetMeta.id}] ${targetMeta.tag}${targetMeta.type ? `(${targetMeta.type})` : ''}: "${targetMeta.label}"`
    : action.element ? `Element [${action.element}]` : 'Page';

  // 8. Save state and pause for human approval
  const nextState = await updateAgentState({
    status: 'awaiting_approval',
    pendingAction: action,
    pendingTargetDesc: targetDesc,
    requiresExtraConfirm: safety.requiresExtraConfirm,
    elementSnapshot: scanRes.elements,
  });

  notifySidePanel({
    type: 'AWAITING_APPROVAL',
    step: nextState.stepIndex + 1,
    totalSteps: nextState.stepLimit,
    action,
    targetDesc,
    requiresExtraConfirm: safety.requiresExtraConfirm,
  });
}

/**
 * Handles human decision on the pending action:
 * - 'approve'
 * - 'skip'
 * - 'dry-run'
 * - 'stop'
 */
export async function handleAgentDecision(payload = {}) {
  const { decision, confirmed } = payload;
  const state = await loadAgentState();

  if (!state.pendingAction) {
    return { success: false, error: 'No pending action awaiting approval.' };
  }

  const currentTabId = state.tabId;
  const logEntry = {
    step: state.stepIndex + 1,
    ...state.pendingAction,
    targetDesc: state.pendingTargetDesc,
    decision,
  };

  // --- STOP DECISION ---
  if (decision === 'stop') {
    logEntry.decision = 'stopped';
    await updateAgentState({
      status: 'stopped',
      pendingAction: null,
      actionLog: [...state.actionLog, logEntry],
    });
    notifySidePanel({ type: 'AGENT_STOPPED', logEntry });
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { type: 'CLEAR_BADGES' }).catch(() => {});
    }
    return { success: true };
  }

  // --- DRY RUN DECISION (Slice 3.4) ---
  if (decision === 'dry-run') {
    if (state.pendingAction.element && currentTabId) {
      await chrome.tabs.sendMessage(currentTabId, {
        type: 'HIGHLIGHT_ELEMENT',
        elementId: state.pendingAction.element,
      }).catch(() => {});
    }
    return { success: true, isDryRun: true, message: 'Dry run: element highlighted on page.' };
  }

  // --- SKIP DECISION ---
  if (decision === 'skip') {
    logEntry.decision = 'skipped';
    const newIndex = state.stepIndex + 1;
    const isDone = newIndex >= state.stepLimit;

    await updateAgentState({
      stepIndex: newIndex,
      actionLog: [...state.actionLog, logEntry],
      status: isDone ? 'done' : 'planning',
      pendingAction: null,
    });

    notifySidePanel({ type: 'AGENT_LOG_UPDATE', logEntry });

    if (isDone) {
      notifySidePanel({
        type: 'AGENT_DONE',
        message: 'Step limit reached.',
        data: await loadAgentState(),
      });
    } else if (currentTabId) {
      runNextStep(currentTabId);
    }
    return { success: true };
  }

  // --- APPROVE DECISION ---
  if (decision === 'approve') {
    // If consequential action requires extra confirmation and not confirmed
    if (state.requiresExtraConfirm && !confirmed) {
      return { success: false, requiresExtraConfirm: true };
    }

    logEntry.decision = 'approved';

    // Execute in live webpage DOM
    if (currentTabId) {
      try {
        await chrome.tabs.sendMessage(currentTabId, {
          type: 'EXECUTE_ACTION',
          payload: {
            action: state.pendingAction,
            elements: state.elementSnapshot,
          },
        });
      } catch (err) {
        console.warn('[Sahayak Agent] DOM execution error:', err);
      }
    }

    const newIndex = state.stepIndex + 1;
    const isDone = state.pendingAction.action === 'done' || newIndex >= state.stepLimit;

    await updateAgentState({
      stepIndex: newIndex,
      actionLog: [...state.actionLog, logEntry],
      status: isDone ? 'done' : 'planning',
      pendingAction: null,
    });

    notifySidePanel({ type: 'AGENT_LOG_UPDATE', logEntry });

    if (isDone) {
      notifySidePanel({
        type: 'AGENT_DONE',
        message: 'Task successfully completed!',
        data: await loadAgentState(),
      });
    } else if (currentTabId) {
      // Small pause to allow DOM updates/animations to finish before scanning again
      setTimeout(() => {
        runNextStep(currentTabId);
      }, 700);
    }
    return { success: true };
  }

  return { success: false, error: 'Unknown decision: ' + decision };
}
