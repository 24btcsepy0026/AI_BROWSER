// ============================================================
// Sahayak - Side Panel Application (sidepanel.js)
// Controller for side panel views, quick actions, settings,
// language toggle, and service worker communication.
// ============================================================

// App State
const state = {
  language: 'en',       // 'en' | 'hinglish'
  activeView: 'home',   // 'home' | 'chat' | 'agent' | 'skills'
  isLoading: false,
  lastAction: null,     // 'summarise' | etc.
  chatHistory: [],      // { role: 'user'|'assistant', content: string }[]
};

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadLanguagePreference();
  initNavTabs();
  initSettingsLink();
  initLangToggle();
  initErrorBanner();
  initMessageListener();
  initChatView();
  initScreenshotPanel();
    initFindPanel();
    initAgentView();
    initSkillsView();

  // Edge-case 1.3: warn if on an internal Chrome page
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url?.startsWith('chrome://') || tabs[0]?.url?.startsWith('chrome-extension://')) {
    showError('Sahayak cannot run on Chrome internal pages. Please navigate to a normal website.');
  }
});

// ============================================================
// Navigation Tabs
// ============================================================
function initNavTabs() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const viewName = tab.dataset.view;
      switchView(viewName);
    });
  });
}

function switchView(viewName) {
  if (state.activeView === viewName) return;
  state.activeView = viewName;

  // Update tab buttons
  document.querySelectorAll('.nav-tab').forEach((t) => {
    const isActive = t.dataset.view === viewName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Show/hide views
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('hidden', v.id !== `view-${viewName}`);
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });
}

// ============================================================
// Language Toggle (Slice 1.7)
// ============================================================
async function loadLanguagePreference() {
  try {
    const result = await chrome.storage.local.get('language');
    if (result.language === 'tanglish' || result.language === 'tan') {
      state.language = 'tanglish';
    } else if (result.language === 'hinglish') {
      state.language = 'hinglish';
    } else {
      state.language = 'en';
    }
  } catch {
    state.language = 'en';
  }
  updateLangUI();
}

function initLangToggle() {
  const toggleBtn = document.getElementById('lang-toggle');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', async () => {
    // Edge-case 6.1: Ignore toggle clicks if request is already in-flight
    if (state.isLoading) return;

    // Three-way rotation: EN -> HIN -> TAN -> EN
    let next;
    if (state.language === 'en') {
      next = 'hinglish';
    } else if (state.language === 'hinglish') {
      next = 'tanglish';
    } else {
      next = 'en';
    }

    state.language = next;
    await chrome.storage.local.set({ language: next });
    updateLangUI();

    // Broadcast update so other pages sync
    try {
      chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        payload: { language: next },
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch {}

    // Edge-case 6.2: Re-run last action only if there is an active output displayed
    if (state.lastAction) {
      rerunLastAction(next);
    }
  });
}

function updateLangUI() {
  const label = document.getElementById('lang-label');
  if (label) {
    if (state.language === 'tanglish') {
      label.textContent = 'TAN';
    } else if (state.language === 'hinglish') {
      label.textContent = 'HIN';
    } else {
      label.textContent = 'EN';
    }
  }

  const toggleBtn = document.getElementById('lang-toggle');
  if (toggleBtn) {
    const titles = {
      en: 'Current language: English. Click to switch to Hinglish.',
      hinglish: 'Current language: Hinglish. Click to switch to Tanglish (TAN).',
      tanglish: 'Current language: Tanglish (Tamil+English). Click to switch to English.',
    };
    toggleBtn.setAttribute('title', titles[state.language] || 'Click to switch language.');
  }
}

function rerunLastAction(lang) {
  if (state.lastAction === 'summarise') {
    handleSummarise({ forceRefresh: true });
  }
}

// ============================================================
// Settings Link
// ============================================================
function initSettingsLink() {
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ============================================================
// Error Banner
// ============================================================
let errorTimer = null;

function initErrorBanner() {}

export function showError(message, retryCallback = null) {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  const textEl = document.getElementById('error-banner-text');
  if (textEl) {
    textEl.textContent = message;
  } else {
    banner.textContent = message;
  }
  const retryBtn = document.getElementById('error-retry-btn');
  if (retryBtn) {
    if (typeof retryCallback === 'function') {
      retryBtn.classList.remove('hidden');
      retryBtn.onclick = () => {
        clearError();
        retryCallback();
      };
    } else {
      retryBtn.classList.add('hidden');
    }
  }
  banner.classList.remove('hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 7000);
}

export function clearError() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.classList.add('hidden');
}

// ============================================================
// Loading State
// ============================================================
export function setLoading(loading, label = 'Thinking...', areaId = 'home-loading') {
  state.isLoading = loading;
  const el = document.getElementById(areaId);
  if (!el) return;
  el.classList.toggle('hidden', !loading);
  const labelEl = document.getElementById(`${areaId.replace('loading', 'loading-label')}`);
  if (labelEl) labelEl.textContent = label;

  // Disable all action buttons and toggle while loading
  document.querySelectorAll('.action-card, .primary-btn, .send-btn').forEach((btn) => {
    btn.disabled = loading;
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.disabled = loading;
}

// ============================================================
// Output Area Helpers (Slice 1.5 & 1.6)
// ============================================================
export function showOutput(title, htmlContent, options = {}) {
  const area    = document.getElementById('home-output');
  const titleEl = document.getElementById('home-output-title');
  const content = document.getElementById('home-output-content');

  if (!area || !titleEl || !content) return;
  titleEl.textContent = title;

  let formatted = renderBasicMarkdown(htmlContent);
  if (options.isYouTube || options.videoUrl) {
    formatted = linkifyTimestamps(formatted, options.videoUrl);
  }

  content.innerHTML = formatted;
  area.classList.remove('hidden');

  // Attach click events for clickable timestamps (Slice 1.6)
  content.querySelectorAll('.yt-timestamp-link').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const seconds = parseInt(link.getAttribute('data-seconds'), 10);
      const url = link.getAttribute('data-url') || link.href;

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'SEEK_VIDEO', seconds }).catch(() => null);
          if (res?.success) return;

          const targetUrl = url.includes('&t=') ? url : (url.includes('?') ? `${url}&t=${seconds}` : `${url}?t=${seconds}`);
          await chrome.tabs.update(activeTab.id, { url: targetUrl });
        }
      } catch {
        window.open(link.href, '_blank');
      }
    });
  });

  // Copy button
  const copyBtn = document.getElementById('home-output-copy');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content.innerText).then(() => {
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      });
    };
  }
}

function linkifyTimestamps(htmlText, youtubeUrl = '') {
  if (!htmlText) return '';
  return htmlText.replace(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g, (match, h, m, s) => {
    const hours = h ? parseInt(h, 10) : 0;
    const minutes = parseInt(m, 10);
    const seconds = parseInt(s, 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const targetUrl = youtubeUrl
      ? (youtubeUrl.includes('?') ? `${youtubeUrl}&t=${totalSeconds}` : `${youtubeUrl}?t=${totalSeconds}`)
      : '#';
    return `<a href="${targetUrl}" class="yt-timestamp-link" data-seconds="${totalSeconds}" data-url="${youtubeUrl}" target="_blank">${match}</a>`;
  });
}

function renderBasicMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

// ============================================================
// Service Worker Communication
// ============================================================
export async function sendToSW(type, payload = {}) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    return await chrome.runtime.sendMessage({ type, payload: { ...payload, tabId } });
  } catch (err) {
    throw new Error('Extension background is starting up. Please try again in a moment.');
  }
}

// ============================================================
// Incoming Messages from Service Worker
// ============================================================
function initMessageListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'CONTEXT_ACTION':
        handleContextAction(msg.payload);
        break;

      case 'CHAT_CHUNK':
        appendChatChunk(msg.chunk);
        break;

      case 'AWAITING_APPROVAL':
        showApprovalCard(msg);
        break;

      case 'AGENT_STATUS':
        // Optional status updates
        break;

      case 'AGENT_LOG_UPDATE':
        if (msg.logEntry) appendActionLogEntry(msg.logEntry);
        break;

      case 'AGENT_BLOCKED':
        showError(`Safety Block: ${msg.reason}`);
        hideApprovalCard();
        setLoading(false);
        break;

      case 'AGENT_DONE':
        onAgentDone(msg);
        break;

      case 'AGENT_STOPPED':
        hideApprovalCard();
        if (msg.logEntry) appendActionLogEntry(msg.logEntry);
        showError('Agent task stopped by user.');
        break;

      case 'TAB_CHANGED':
      case 'TAB_NAVIGATED':
        onTabChanged();
        break;

      case 'SETTINGS_UPDATED':
        if (msg.payload?.language) {
          state.language = msg.payload.language;
          updateLangUI();
        }
        break;

      case 'MODEL_ERROR':
        showError(msg.error);
        setLoading(false);
        break;
    }
  });
}

function handleContextAction(payload) {
  if (!payload) return;
  const { action, text, result, label, originalText } = payload;

  // If result already processed (came from SW handler), display it
  if (result) {
    switchView('home');
    showOutput(label || 'Result', result, {});
    return;
  }

  // Otherwise, trigger the action now (panel was just opened from right-click)
  if (action && text) {
    switchView('home');
    triggerContextAction(action, label || action, text);
  }
}

function appendChatChunk(chunk) {}

function onTabChanged() {
  state.chatHistory = [];
}

// ============================================================
// Action Button Wiring
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const actions = {
    'btn-summarise': () => handleSummarise(),
    'btn-screenshot': () => handleScreenshot(),
    'btn-explain': () => handleExplain(),
    'btn-translate': () => handleTranslate(),
    'btn-draft': () => handleDraft(),
    'btn-find': () => handleFind(),
  };

  Object.entries(actions).forEach(([id, fn]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', fn);
  });

  // Chat send
  const sendBtn = document.getElementById('chat-send');
  const chatInput = document.getElementById('chat-input');
  if (sendBtn) sendBtn.addEventListener('click', () => handleChatSend());
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSend();
      }
    });
  }

  // Agent controls
  document.getElementById('agent-start-btn')?.addEventListener('click', () => handleAgentStart());
  document.getElementById('btn-approve')?.addEventListener('click', () => sendAgentDecision('approve'));
  document.getElementById('btn-skip')?.addEventListener('click',    () => sendAgentDecision('skip'));
  document.getElementById('btn-stop')?.addEventListener('click',    () => sendAgentDecision('stop'));
  document.getElementById('btn-dry-run')?.addEventListener('click', () => sendAgentDecision('dry-run'));
});

// ============================================================
// Feature Implementations & Stubs
// ============================================================
async function handleSummarise() {
  clearError();
  setLoading(true, state.language === 'hinglish' ? 'Page read kar rahe hain...' : 'Reading and summarising page...');
  state.lastAction = 'summarise';

  try {
    const response = await sendToSW('SUMMARISE', { language: state.language });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to generate summary.');
    }

    // Hide welcome card
    document.getElementById('home-welcome')?.classList.add('hidden');

    const prefix = response.isYouTube ? 'ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¬ ' : 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Å¾ ';
    const defaultTitle = response.isYouTube
      ? (state.language === 'hinglish' ? 'ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¬ YouTube Video Summary' : 'ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¬ YouTube Summary')
      : (state.language === 'hinglish' ? 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Å¾ Article Summary (Hinglish)' : 'ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Å¾ Article Summary');

    const displayTitle = response.title ? `${prefix}${response.title}` : defaultTitle;
    showOutput(displayTitle, response.summary, { isYouTube: response.isYouTube, videoUrl: response.url });
  } catch (err) {
    console.error('[Sahayak] Summarise error:', err);
    showError(err.message || 'Could not summarise this page.', () => handleSummarise());
  } finally {
    setLoading(false);
  }
}

async function handleScreenshot() { openScreenshotPanel(); }
async function handleExplain() { await triggerContextAction('sahayak-explain', 'Explanation'); }
async function handleTranslate() { await triggerContextAction('sahayak-translate', 'Translation'); }
async function handleDraft() { await triggerContextAction('sahayak-draft', 'Draft Reply'); }
async function handleFind() { openFindPanel(); }
async function handleChatSend() {
  const chatInput = document.getElementById('chat-input');
  const query = chatInput?.value?.trim();
  if (!query) return;

  appendChatMessage('user', query);
  chatInput.value = '';
  chatInput.style.height = 'auto';

  const typingId = appendChatTyping();
  try {
    const response = await sendToSW('PAGE_CHAT', {
      query,
      history: state.chatHistory,
      language: state.language,
    });
    removeTypingIndicator(typingId);
    if (!response || !response.success) throw new Error(response?.error || 'Failed to get an answer.');
    appendChatMessage('assistant', response.answer);
    state.chatHistory.push({ role: 'user', content: query });
    state.chatHistory.push({ role: 'assistant', content: response.answer });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatMessage('assistant', 'âš ï¸ ' + (err.message || 'Could not answer. Please try again.'));
  }
}
// ============================================================
// Agent Loop UI Controller (Slice 3.3 & Slice 3.4)
// ============================================================

async function handleAgentStart() {
  const input = document.getElementById('agent-task-input');
  const task = input?.value?.trim();
  if (!task) {
    showError('Please enter a task description for the agent.');
    return;
  }

  clearError();
  const startBtn = document.getElementById('agent-start-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
  }

  // Clear previous log and approval card
  hideApprovalCard();
  const logList = document.getElementById('action-log-list');
  if (logList) logList.innerHTML = '';
  document.getElementById('action-log-section')?.classList.add('hidden');

  try {
    const res = await sendToSW('START_AGENT_TASK', { task });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to start agent task.');
    }
  } catch (err) {
    showError(err.message || 'Could not start agent.');
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
  }
}

async function sendAgentDecision(decision, confirmed = false) {
  clearError();
  try {
    const res = await sendToSW('AGENT_DECISION', { decision, confirmed });
    if (res && res.requiresExtraConfirm) {
      document.getElementById('consequential-warning')?.classList.remove('hidden');
      return;
    }
    if (res && res.isDryRun) {
      showError('👁️ Dry Run: Target element highlighted on page.');
      return;
    }
    if (!res || !res.success) {
      throw new Error(res?.error || 'Failed to process decision.');
    }
    hideApprovalCard();
  } catch (err) {
    showError(err.message || 'Agent decision error.');
  }
}

function showApprovalCard(data) {
  const card = document.getElementById('agent-approval-card');
  if (!card) return;

  const stepBadge = document.getElementById('approval-step-label');
  const actVal = document.getElementById('approval-action');
  const targetVal = document.getElementById('approval-target');
  const valVal = document.getElementById('approval-value');
  const reasonVal = document.getElementById('approval-reason');
  const warning = document.getElementById('consequential-warning');

  const action = data.action || {};
  if (stepBadge) stepBadge.textContent = `Step ${data.step || 1} of ${data.totalSteps || 20}`;
  if (actVal) actVal.textContent = (action.action || '').toUpperCase();
  if (targetVal) targetVal.textContent = data.targetDesc || (action.element ? `Element [${action.element}]` : '—');
  if (valVal) valVal.textContent = action.value != null ? action.value : '—';
  if (reasonVal) reasonVal.textContent = action.reason || '—';

  const btnApprove = document.getElementById('btn-approve');
  if (data.requiresExtraConfirm) {
    warning?.classList.remove('hidden');
    if (btnApprove) {
      btnApprove.disabled = true;
      btnApprove.title = 'Please click Confirm Proceed below for consequential action';
    }
  } else {
    warning?.classList.add('hidden');
    if (btnApprove) {
      btnApprove.disabled = false;
      btnApprove.title = '';
    }
  }

  card.classList.remove('hidden');
}

function hideApprovalCard() {
  document.getElementById('agent-approval-card')?.classList.add('hidden');
  const btnApprove = document.getElementById('btn-approve');
  if (btnApprove) {
    btnApprove.disabled = false;
    btnApprove.title = '';
  }
  document.getElementById('consequential-warning')?.classList.add('hidden');
}

function appendActionLogEntry(entry) {
  const section = document.getElementById('action-log-section');
  const list = document.getElementById('action-log-list');
  if (!section || !list) return;

  section.classList.remove('hidden');

  const li = document.createElement('li');
  li.className = 'log-entry';

  const stepSpan = document.createElement('span');
  stepSpan.className = 'log-step';
  stepSpan.textContent = `Step ${entry.step || 1}`;

  const actSpan = document.createElement('span');
  actSpan.className = 'log-action';
  actSpan.textContent = `${entry.action}${entry.element ? ' [' + entry.element + ']' : ''}`;

  const reasonSpan = document.createElement('span');
  reasonSpan.className = 'log-reason';
  reasonSpan.textContent = entry.reason || (entry.value ? `value: "${entry.value}"` : '');

  const decisionSpan = document.createElement('span');
  decisionSpan.className = `log-decision log-decision-${entry.decision}`;
  decisionSpan.textContent = entry.decision ? entry.decision.toUpperCase() : 'DONE';

  li.appendChild(stepSpan);
  li.appendChild(actSpan);
  li.appendChild(reasonSpan);
  li.appendChild(decisionSpan);

  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

function onAgentDone(msg) {
  hideApprovalCard();
  setLoading(false);
  const message = msg.message || 'Agent task complete!';
  showError('✅ ' + message);

  // If there's an actionLog in the state, make sure it is rendered
  if (msg.data && msg.data.actionLog) {
    const list = document.getElementById('action-log-list');
    if (list) {
      list.innerHTML = '';
      msg.data.actionLog.forEach(appendActionLogEntry);
    }
  }
}

async function initAgentView() {
  // Wire up extra confirmation button for consequential actions
  document.getElementById('btn-confirm-approve')?.addEventListener('click', () => {
    sendAgentDecision('approve', true);
  });

  // Check existing session state on load (Slice 3.4 Persistence)
  try {
    const res = await sendToSW('GET_AGENT_STATE');
    if (res && res.success && res.state) {
      const state = res.state;
      if (state.task) {
        const input = document.getElementById('agent-task-input');
        if (input) input.value = state.task;
      }

      // Restore Action Log
      if (state.actionLog && state.actionLog.length > 0) {
        state.actionLog.forEach(appendActionLogEntry);
      }

      // Restore Approval Card if awaiting
      if (state.status === 'awaiting_approval' && state.pendingAction) {
        showApprovalCard({
          step: state.stepIndex + 1,
          totalSteps: state.stepLimit,
          action: state.pendingAction,
          targetDesc: state.pendingTargetDesc,
          requiresExtraConfirm: state.requiresExtraConfirm,
        });
      }
    }
  } catch (err) {
    // Ignore initial state error
  }
}

// === Chat UI Helpers (Slice 2.1) ===

function appendChatMessage(role, text) {
  const container = document.getElementById("chat-messages");
  if (!container) return;
  const ph = container.querySelector(".chat-empty-state");
  if (ph) ph.remove();
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-bubble--" + role;
  if (role === "assistant") { bubble.innerHTML = renderBasicMarkdown(text); }
  else { bubble.textContent = text; }
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendChatTyping() {
  const container = document.getElementById("chat-messages");
  if (!container) return "typing-none";
  const id = "typing-" + Date.now();
  const el = document.createElement("div");
  el.className = "chat-bubble chat-bubble--assistant chat-bubble--typing";
  el.id = id;
  el.innerHTML = "<span class=\"typing-dot\"></span><span class=\"typing-dot\"></span><span class=\"typing-dot\"></span>";
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function initChatView() {
  const c = document.getElementById("chat-messages");
  if (!c || c.children.length > 0) return;
  const empty = document.createElement("div");
  empty.className = "chat-empty-state";
  empty.textContent = "Ask anything about the current page...";
  c.appendChild(empty);
}

// === Context Action Trigger (Slice 2.2) ===

async function triggerContextAction(action, label, preselectedText) {
  let selectedText = preselectedText || null;
  if (!selectedText) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab && tab.id) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }).catch(() => null);
        if (res && res.text) selectedText = res.text;
      }
    } catch(e) {}
  }
  if (!selectedText || !selectedText.trim()) {
    showError("To use " + label + ", please select some text on the page first.");
    return;
  }
  clearError();
  setLoading(true, "Running " + label + "...");
  state.lastAction = action;
  switchView("home");
  const wEl = document.getElementById("home-welcome");
  if (wEl) wEl.classList.add("hidden");
  try {
    const response = await sendToSW("CONTEXT_ACTION_HANDLE", { action, text: selectedText, language: state.language });
    if (!response || !response.success) throw new Error((response && response.error) || label + " failed.");
    showOutput(label, response.result, {});
  } catch (err) {
    showError(err.message || label + " failed.");
  } finally {
    setLoading(false);
  }
}

// ============================================================
// Screenshot Panel Controller (Slice 2.3)
// ============================================================

// Screenshot state
const ssState = {
  base64Full: null,      // raw full screenshot base64
  base64Final: null,     // cropped (or full) base64 to send
  cropRect: null,        // { x, y, w, h } in canvas coords
  isDragging: false,
  dragStart: null,
};

function openScreenshotPanel() {
  const panel = document.getElementById('screenshot-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  // Reset state
  ssState.base64Full = null;
  ssState.base64Final = null;
  ssState.cropRect = null;
  // Show step 1
  document.getElementById('screenshot-step-preview')?.classList.remove('hidden');
  document.getElementById('screenshot-step-ask')?.classList.add('hidden');
  document.getElementById('screenshot-reset-crop-btn')?.classList.add('hidden');
  document.getElementById('screenshot-answer')?.classList.add('hidden');
  document.getElementById('screenshot-retry-btn')?.classList.add('hidden');
  const qInput = document.getElementById('screenshot-question');
  if (qInput) qInput.value = '';
  // Capture and display screenshot
  captureAndDisplay();
}

async function captureAndDisplay() {
  const canvas = document.getElementById('screenshot-canvas');
  const overlay = document.getElementById('screenshot-crop-overlay');
  if (!canvas) return;
  try {
    const res = await sendToSW('CAPTURE_SCREENSHOT', {});
    if (!res || !res.success) throw new Error(res?.error || 'Screenshot failed.');
    ssState.base64Full = res.data.base64;

    // Draw image onto canvas
    const img = new Image();
    img.onload = () => {
      const maxW = 320;
      const scale = maxW / img.width;
      canvas.width = maxW;
      canvas.height = img.height * scale;
      if (overlay) { overlay.width = canvas.width; overlay.height = canvas.height; }
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      ssState.base64Final = ssState.base64Full; // default to full
      initCropDrag(canvas, overlay);
    };
    img.src = 'data:image/png;base64,' + res.data.base64;
  } catch (err) {
    showError(err.message || 'Could not capture screenshot.', () => captureAndDisplay());
    document.getElementById('screenshot-panel')?.classList.add('hidden');
  }
}

function initCropDrag(canvas, overlay) {
  if (!canvas || !overlay) return;
  const octx = overlay.getContext('2d');

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(canvas.width,  (clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (clientY - rect.top)  * scaleY)),
    };
  }

  function drawCropOverlay(rect) {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.fillStyle = 'rgba(0,0,0,0.45)';
    octx.fillRect(0, 0, overlay.width, overlay.height);
    octx.clearRect(rect.x, rect.y, rect.w, rect.h);
    octx.strokeStyle = '#7c6bef';
    octx.lineWidth = 2;
    octx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }

  overlay.onmousedown = overlay.ontouchstart = (e) => {
    e.preventDefault();
    ssState.isDragging = true;
    ssState.dragStart = getPos(e);
    ssState.cropRect = null;
    octx.clearRect(0, 0, overlay.width, overlay.height);
  };

  overlay.onmousemove = overlay.ontouchmove = (e) => {
    if (!ssState.isDragging) return;
    e.preventDefault();
    const pos = getPos(e);
    const rect = {
      x: Math.min(ssState.dragStart.x, pos.x),
      y: Math.min(ssState.dragStart.y, pos.y),
      w: Math.abs(pos.x - ssState.dragStart.x),
      h: Math.abs(pos.y - ssState.dragStart.y),
    };
    if (rect.w > 5 && rect.h > 5) { drawCropOverlay(rect); ssState.cropRect = rect; }
  };

  overlay.onmouseup = overlay.ontouchend = () => {
    ssState.isDragging = false;
    if (ssState.cropRect && ssState.cropRect.w > 10 && ssState.cropRect.h > 10) {
      document.getElementById('screenshot-reset-crop-btn')?.classList.remove('hidden');
      // Crop base64
      ssState.base64Final = cropCanvasToBase64(canvas, ssState.cropRect);
    }
  };
}

function cropCanvasToBase64(canvas, rect) {
  const cropped = document.createElement('canvas');
  cropped.width = rect.w;
  cropped.height = rect.h;
  cropped.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const dataUrl = cropped.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

function initScreenshotPanel() {
  // Close button
  document.getElementById('screenshot-close-btn')?.addEventListener('click', () => {
    document.getElementById('screenshot-panel')?.classList.add('hidden');
  });

  // Reset crop
  document.getElementById('screenshot-reset-crop-btn')?.addEventListener('click', () => {
    ssState.cropRect = null;
    ssState.base64Final = ssState.base64Full;
    const overlay = document.getElementById('screenshot-crop-overlay');
    overlay?.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    document.getElementById('screenshot-reset-crop-btn')?.classList.add('hidden');
  });

  // Use this screenshot -> go to step 2
  document.getElementById('screenshot-use-btn')?.addEventListener('click', () => {
    if (!ssState.base64Final) { showError('Screenshot not ready yet.'); return; }
    document.getElementById('screenshot-step-preview')?.classList.add('hidden');
    document.getElementById('screenshot-step-ask')?.classList.remove('hidden');
    const finalImg = document.getElementById('screenshot-final-img');
    if (finalImg) finalImg.src = 'data:image/png;base64,' + ssState.base64Final;
    document.getElementById('screenshot-answer')?.classList.add('hidden');
    document.getElementById('screenshot-retry-btn')?.classList.add('hidden');
  });

  // Back button
  document.getElementById('screenshot-back-btn')?.addEventListener('click', () => {
    document.getElementById('screenshot-step-ask')?.classList.add('hidden');
    document.getElementById('screenshot-step-preview')?.classList.remove('hidden');
  });

  // Ask button
  document.getElementById('screenshot-ask-btn')?.addEventListener('click', () => askAboutScreenshot());

  // Allow Enter to submit question
  document.getElementById('screenshot-question')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAboutScreenshot(); }
  });

  // Retry button
  document.getElementById('screenshot-retry-btn')?.addEventListener('click', () => askAboutScreenshot());
}

async function askAboutScreenshot() {
  const query = document.getElementById('screenshot-question')?.value?.trim();
  if (!query) { showError('Please type a question about the screenshot.'); return; }
  if (!ssState.base64Final) { showError('No screenshot available.'); return; }

  const loading = document.getElementById('screenshot-ask-loading');
  const answerEl = document.getElementById('screenshot-answer');
  const retryBtn = document.getElementById('screenshot-retry-btn');
  const askBtn = document.getElementById('screenshot-ask-btn');

  loading?.classList.remove('hidden');
  if (answerEl) answerEl.classList.add('hidden');
  if (retryBtn) retryBtn.classList.add('hidden');
  if (askBtn) askBtn.disabled = true;

  try {
    const res = await sendToSW('SCREENSHOT_ASK', {
      base64: ssState.base64Final,
      query,
      language: state.language,
    });

    loading?.classList.add('hidden');
    if (askBtn) askBtn.disabled = false;

    if (!res || !res.success) throw new Error(res?.error || 'Could not analyse screenshot.');

    if (answerEl) {
      answerEl.innerHTML = renderBasicMarkdown(res.answer);
      answerEl.classList.remove('hidden');
    }
    if (retryBtn) retryBtn.classList.remove('hidden');
  } catch (err) {
    loading?.classList.add('hidden');
    if (askBtn) askBtn.disabled = false;
    if (answerEl) {
      answerEl.innerHTML = '<span class="error-inline">?? ' + (err.message || 'Failed to analyse.') + '</span>';
      answerEl.classList.remove('hidden');
    }
    if (retryBtn) retryBtn.classList.remove('hidden');
  }
}


// ============================================================
// Find It For Me Panel Controller (Slice 3.1 & 3.2)
// ============================================================

let lastFoundElementId = null;

function openFindPanel() {
  const panel = document.getElementById('find-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const input = document.getElementById('find-input');
  if (input) {
    input.focus();
    input.select();
  }
}

function initFindPanel() {
  const panel = document.getElementById('find-panel');
  const closeBtn = document.getElementById('find-close-btn');
  const submitBtn = document.getElementById('find-submit-btn');
  const input = document.getElementById('find-input');
  const scanBtn = document.getElementById('find-scan-btn');
  const clearBtn = document.getElementById('find-clear-btn');
  const rehighlightBtn = document.getElementById('find-rehighlight-btn');
  const loading = document.getElementById('find-loading');
  const loadingText = document.getElementById('find-loading-text');
  const resultCard = document.getElementById('find-result-card');
  const mapSection = document.getElementById('find-map-section');
  const mapText = document.getElementById('find-map-text');
  const mapCount = document.getElementById('find-map-count');

  // Close button
  closeBtn?.addEventListener('click', () => {
    panel?.classList.add('hidden');
  });

  // Re-highlight button
  rehighlightBtn?.addEventListener('click', async () => {
    if (lastFoundElementId) {
      await sendToSW('HIGHLIGHT_PAGE_ELEMENT', { elementId: lastFoundElementId });
    }
  });

  // Find & Highlight submit
  async function triggerFind() {
    const query = input?.value?.trim();
    if (!query) {
      showError('Please enter what you are looking for.');
      return;
    }
    clearError();
    resultCard?.classList.add('hidden');
    if (loading) {
      if (loadingText) loadingText.textContent = 'Scanning page & locating element...';
      loading.classList.remove('hidden');
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await sendToSW('FIND_ELEMENT', { query, language: state.language });
      if (!res || !res.success) {
        throw new Error(res?.error || 'Find It failed.');
      }

      if (res.element) {
        lastFoundElementId = res.element;
        const b = document.getElementById('find-result-badge');
        const t = document.getElementById('find-result-tag');
        const l = document.getElementById('find-result-label');
        const r = document.getElementById('find-result-reason');

        if (b) b.textContent = `[${res.element}]`;
        if (t) t.textContent = `${res.tag}${res.type ? ` (${res.type})` : ''}`;
        if (l) l.textContent = res.label || `Element [${res.element}]`;
        if (r) r.textContent = res.reason;
        resultCard?.classList.remove('hidden');
      } else {
        lastFoundElementId = null;
        showError(res.reason || 'Sahayak could not find a matching element. Try rephrasing.');
      }
    } catch (err) {
      showError(err.message || 'Failed to locate element.');
    } finally {
      loading?.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  submitBtn?.addEventListener('click', triggerFind);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerFind();
    }
  });

  // Scan & Show Badges
  async function triggerScan() {
    clearError();
    if (loading) {
      if (loadingText) loadingText.textContent = 'Scanning interactive elements...';
      loading.classList.remove('hidden');
    }
    try {
      const res = await sendToSW('SCAN_PAGE_ELEMENTS', { renderBadges: true });
      if (!res || !res.success) throw new Error(res?.error || 'Scan failed.');

      if (mapText && mapCount) {
        mapCount.textContent = res.count || (res.elements ? res.elements.length : 0);
        mapText.textContent = res.actionMapText || 'No interactive elements detected.';
        mapSection?.classList.remove('hidden');
      }
    } catch (err) {
      showError(err.message || 'Failed to scan page elements.');
    } finally {
      loading?.classList.add('hidden');
    }
  }

  scanBtn?.addEventListener('click', triggerScan);

  // Clear Badges
  clearBtn?.addEventListener('click', async () => {
    try {
      await sendToSW('CLEAR_ELEMENT_BADGES', {});
      mapSection?.classList.add('hidden');
      resultCard?.classList.add('hidden');
      lastFoundElementId = null;
    } catch (err) {
      showError(err.message || 'Failed to clear badges.');
    }
  });

  // Agent tab scan buttons (Slice 3.1)
  const agentScanBtn = document.getElementById('btn-agent-scan');
  const agentClearBtn = document.getElementById('btn-agent-clear-badges');
  const agentResultsBox = document.getElementById('agent-scan-results');
  const agentCountEl = document.getElementById('agent-scan-count');
  const agentTextEl = document.getElementById('agent-scan-text');
  const agentCloseBtn = document.getElementById('agent-scan-close-btn');

  agentCloseBtn?.addEventListener('click', () => {
    agentResultsBox?.classList.add('hidden');
  });

  agentScanBtn?.addEventListener('click', async () => {
    clearError();
    const originalText = agentScanBtn.textContent;
    agentScanBtn.textContent = '⏳ Scanning...';
    agentScanBtn.disabled = true;

    try {
      const res = await sendToSW('SCAN_PAGE_ELEMENTS', { renderBadges: true });
      if (!res || !res.success) throw new Error(res?.error || 'Scan failed.');

      if (agentCountEl) agentCountEl.textContent = res.count || (res.elements ? res.elements.length : 0);
      if (agentTextEl) agentTextEl.textContent = res.actionMapText || 'No interactive elements detected.';
      agentResultsBox?.classList.remove('hidden');
    } catch (err) {
      showError(err.message || 'Failed to scan page elements.');
    } finally {
      agentScanBtn.textContent = originalText;
      agentScanBtn.disabled = false;
    }
  });

  agentClearBtn?.addEventListener('click', async () => {
    try {
      await sendToSW('CLEAR_ELEMENT_BADGES', {});
      agentResultsBox?.classList.add('hidden');
      clearError();
    } catch (err) {
      showError(err.message || 'Failed to clear badges.');
    }
  });
}


// ============================================================
// One-Click Skills Controller (Slice 4.2)
// ============================================================

let cachedSkills = [];

async function loadAndRenderSkills() {
  const listEl = document.getElementById('skills-list');
  if (!listEl) return;

  try {
    const res = await sendToSW('GET_SKILLS');
    cachedSkills = res?.skills || [];

    listEl.innerHTML = '';

    if (cachedSkills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skills-empty-state';
      empty.textContent = 'No skills saved yet. Click + New to create your first one!';
      listEl.appendChild(empty);
      return;
    }

    cachedSkills.forEach((skill) => {
      const li = document.createElement('li');
      li.className = 'skill-item';
      li.dataset.skillId = skill.id;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'skill-icon';
      iconSpan.textContent = skill.icon || '⚡';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'skill-info';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'skill-name';
      nameDiv.textContent = skill.name;

      const scopeDiv = document.createElement('div');
      scopeDiv.className = 'skill-scope';
      const promptSnippet = (skill.prompt || '').length > 40
        ? (skill.prompt || '').substring(0, 40) + '...'
        : (skill.prompt || '');
      scopeDiv.textContent = `${(skill.scope || 'page').toUpperCase()} • ${promptSnippet}`;

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(scopeDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'skill-actions';

      const runBtn = document.createElement('button');
      runBtn.className = 'skill-run-btn';
      runBtn.textContent = 'Run';
      runBtn.setAttribute('aria-label', `Run ${skill.name}`);
      runBtn.addEventListener('click', () => runSkillItem(skill, runBtn));

      const delBtn = document.createElement('button');
      delBtn.className = 'skill-delete-btn';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete skill';
      delBtn.setAttribute('aria-label', `Delete ${skill.name}`);
      delBtn.addEventListener('click', () => deleteSkillItem(skill.id));

      actionsDiv.appendChild(runBtn);
      actionsDiv.appendChild(delBtn);

      li.appendChild(iconSpan);
      li.appendChild(infoDiv);
      li.appendChild(actionsDiv);

      listEl.appendChild(li);
    });
  } catch (err) {
    showError('Failed to load skills: ' + err.message);
  }
}

async function runSkillItem(skill, btnEl) {
  if (btnEl.disabled) return;
  clearError();

  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Running...';

  try {
    // Edge case 20.7: Check selection if scope is selection
    if (skill.scope === 'selection') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.id) {
        const selRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }).catch(() => null);
        if (!selRes || !selRes.text || !selRes.text.trim()) {
          showError('Please select some text on the webpage before running this skill.');
          return;
        }
      }
    }

    const res = await sendToSW('RUN_SKILL', { skill });
    if (!res || !res.success) {
      throw new Error(res?.error || 'Skill execution failed.');
    }

    if (res.scope === 'agent') {
      // Switch to Agent tab so the user sees the workflow running
      switchView('agent');
      const input = document.getElementById('agent-task-input');
      if (input) input.value = skill.prompt;
    } else if (res.scope === 'page' || res.scope === 'selection') {
      // Switch to Home tab and render the markdown output
      switchView('home');
      document.getElementById('home-welcome')?.classList.add('hidden');
      showOutput(skill.name, res.result);
    }
  } catch (err) {
    showError(err.message || 'Failed to run skill.');
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

async function deleteSkillItem(skillId) {
  cachedSkills = cachedSkills.filter((s) => s.id !== skillId);
  try {
    await sendToSW('SAVE_SKILLS', { skills: cachedSkills });
    await loadAndRenderSkills();
  } catch (err) {
    showError('Failed to delete skill: ' + err.message);
  }
}

function initSkillsView() {
  loadAndRenderSkills();

  const newBtn = document.getElementById('btn-new-skill');
  const importBtn = document.getElementById('btn-import-skills');
  const exportBtn = document.getElementById('btn-export-skills');
  const fileInput = document.getElementById('skills-file-input');

  const modal = document.getElementById('skill-modal');
  const closeBtn = document.getElementById('skill-modal-close-btn');
  const cancelBtn = document.getElementById('skill-cancel-btn');
  const saveBtn = document.getElementById('skill-save-btn');

  const nameInput = document.getElementById('skill-name-input');
  const iconInput = document.getElementById('skill-icon-input');
  const scopeSelect = document.getElementById('skill-scope-select');
  const promptInput = document.getElementById('skill-prompt-input');

  // Open modal
  newBtn?.addEventListener('click', () => {
    if (nameInput) nameInput.value = '';
    if (iconInput) iconInput.value = '⚡';
    if (scopeSelect) scopeSelect.value = 'page';
    if (promptInput) promptInput.value = '';
    modal?.classList.remove('hidden');
    nameInput?.focus();
  });

  // Close modal
  const closeModal = () => modal?.classList.add('hidden');
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  // Save new skill
  saveBtn?.addEventListener('click', async () => {
    const name = nameInput?.value?.trim();
    const prompt = promptInput?.value?.trim();
    const icon = iconInput?.value?.trim() || '⚡';
    const scope = scopeSelect?.value || 'page';

    if (!name) {
      showError('Please give your skill a name.');
      nameInput?.focus();
      return;
    }
    if (!prompt) {
      showError('Please enter a prompt recipe for the skill.');
      promptInput?.focus();
      return;
    }

    const newSkill = {
      id: 'skill-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name,
      icon,
      scope,
      prompt,
    };

    cachedSkills.push(newSkill);
    try {
      await sendToSW('SAVE_SKILLS', { skills: cachedSkills });
      closeModal();
      await loadAndRenderSkills();
    } catch (err) {
      showError('Failed to save skill: ' + err.message);
    }
  });

  // Export Skills (JSON download)
  exportBtn?.addEventListener('click', async () => {
    try {
      const res = await sendToSW('GET_SKILLS');
      const skills = res?.skills || [];
      const blob = new Blob([JSON.stringify(skills, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sahayak-skills.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showError('Failed to export skills: ' + err.message);
    }
  });

  // Import Skills (JSON file upload)
  importBtn?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let imported = null;
      try {
        imported = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON format in the uploaded file.');
      }

      if (!Array.isArray(imported)) {
        throw new Error('Skills file must contain an array of skills.');
      }

      // Merge and deduplicate by ID or name
      const existingRes = await sendToSW('GET_SKILLS');
      const existing = existingRes?.skills || [];
      const skillMap = new Map();

      existing.forEach((s) => skillMap.set(s.id || s.name, s));
      imported.forEach((s) => {
        if (s.name && s.prompt) {
          const id = s.id || ('skill-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6));
          skillMap.set(id, { ...s, id });
        }
      });

      const merged = Array.from(skillMap.values());
      await sendToSW('SAVE_SKILLS', { skills: merged });
      await loadAndRenderSkills();
      showError('✅ Successfully imported ' + imported.length + ' skills!');
    } catch (err) {
      showError('Import failed: ' + err.message);
    }
  });
}
