// ============================================================
// Sahayak - Background Service Worker
// Entry point for all extension logic: message routing,
// AI calls, agent loop, safety, and storage management.
// ============================================================

import {
  getApiKey,
  setApiKey,
  hasApiKey,
  getLanguage,
  setLanguage,
  getAllSettings,
  saveAllSettings,
  getCachedItem,
  setCachedItem,
  getSkills,
  saveSkills,
  getProfile,
  saveProfile,
} from './storage-manager.js';
import { callModel } from './model-router.js';
import { startAgentTask, handleAgentDecision, loadAgentState, resetAgentState } from './agent-loop.js';
import { buildSummaryPrompt, buildYouTubePrompt, buildChatPrompt, buildContextActionPrompt, buildElementSelectPrompt } from './prompt-builder.js';

// Safe broadcast helper that prevents "Receiving end does not exist" warnings
function safeBroadcastMessage(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Expected when side panel or popup is not open; safely ignore
      }
    });
  } catch (e) {
    // Context invalidated or closed
  }
}

// Startup: open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
      console.warn('[Sahayak] Failed to open side panel on click:', err);
    });
  }
});

// Register context menus once on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sahayak-explain',
    title: 'Sahayak: Explain this',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'sahayak-translate',
    title: 'Sahayak: Translate',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'sahayak-draft',
    title: 'Sahayak: Draft a reply',
    contexts: ['selection'],
  });

  console.log('[Sahayak] Extension installed. Context menus registered.');
});

// Central message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[Sahayak SW] Error handling message:', msg?.type, err);
      sendResponse({ success: false, error: err.message || 'An unexpected error occurred.' });
    });

  // Return true to keep the message channel open for async response
  return true;
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab?.id) return;

  // Open side panel and forward the context action
  await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});

  // Small delay to allow panel to mount before messaging
  setTimeout(() => {
    safeBroadcastMessage({
      type: 'CONTEXT_ACTION',
      payload: {
        action: info.menuItemId, // e.g. 'sahayak-explain'
        text: info.selectionText,
      },
    });
  }, 300);
});

// Tab change: notify side panel to reset page context
chrome.tabs.onActivated.addListener((activeInfo) => {
  safeBroadcastMessage({
    type: 'TAB_CHANGED',
    payload: { tabId: activeInfo.tabId },
  });
});

// Tab navigation: invalidate page cache
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    safeBroadcastMessage({
      type: 'TAB_NAVIGATED',
      payload: { tabId, url: changeInfo.url },
    });
  }
});

// ============================================================
// Message Handler - routes messages to the correct module.
// ============================================================
async function handleMessage(msg, sender) {
  if (!msg || !msg.type) {
    return { success: false, error: 'Invalid message format' };
  }

  switch (msg.type) {
    // Settings & Storage handlers (Slice 1.2)
    case 'CHECK_API_KEY': {
      const exists = await hasApiKey(msg.payload?.provider || 'gemini');
      return { success: true, hasKey: exists };
    }

    case 'GET_SETTINGS': {
      const settings = await getAllSettings();
      return { success: true, settings };
    }

    case 'SAVE_SETTINGS': {
      await saveAllSettings(msg.payload || {});
      return { success: true };
    }

    // Content Extraction (Slice 1.3)
    case 'EXTRACT_CONTENT': {
      return await extractContentFromTab(msg.payload?.tabId);
    }

    // AI Model Call (Slice 1.4)
    case 'CALL_MODEL': {
      const text = await callModel({
        prompt: msg.payload?.prompt || 'Say hello in 3 words.',
        model: msg.payload?.model || 'flash-lite',
        image: msg.payload?.image || null,
      });
      return { success: true, text };
    }

    // Article Summarisation (Slice 1.5)
    case 'SUMMARISE': {
      return await handleSummarise(msg.payload);
    }

    // YouTube Summarisation (Slice 1.6)
    case 'SUMMARISE_YOUTUBE': {
      return await handleYouTubeSummarise(msg.payload);
    }

    // Grounded Page Chat (Slice 2.1)
    case 'PAGE_CHAT': {
      return await handlePageChat(msg.payload);
    }

    // Context Menu Quick Actions (Slice 2.2)
    case 'CONTEXT_ACTION_HANDLE': {
      return await handleContextActionRequest(msg.payload);
    }

    // Phase 1 handlers (Slice 1.4-1.7)
    // case 'SUMMARISE': return handleSummarise(msg.payload);
    // Screenshot Capture (Slice 2.3)
    case 'CAPTURE_SCREENSHOT': {
      return await handleCaptureScreenshot(msg.payload);
    }

    // Screenshot Visual Q&A (Slice 2.3)
    case 'SCREENSHOT_ASK': {
      return await handleScreenshotAsk(msg.payload);
    }

    // Interactive Element Scanner & Badges (Slice 3.1)
    case 'SCAN_PAGE_ELEMENTS': {
      return await handleScanPageElements(msg.payload);
    }

    case 'CLEAR_ELEMENT_BADGES': {
      return await handleClearElementBadges(msg.payload);
    }

    // Find It For Me (Slice 3.2)
    case 'FIND_ELEMENT': {
      return await handleFindElement(msg.payload);
    }

    case 'HIGHLIGHT_PAGE_ELEMENT': {
      return await handleHighlightPageElement(msg.payload);
    }

    // Agent Loop State Machine (Slice 3.3 & Slice 3.4)
    case 'START_AGENT_TASK': {
      const targetTab = await findTargetTab(msg.payload?.tabId);
      if (!targetTab || !targetTab.url) {
        throw new Error('No active webpage found to execute agent task.');
      }
      if (isRestrictedUrl(targetTab.url)) {
        throw new Error('Cannot run agent on Chrome internal pages.');
      }
      await ensureContentScriptsInTab(targetTab.id);
      await startAgentTask(msg.payload?.task, targetTab.id);
      return { success: true };
    }

    case 'AGENT_DECISION': {
      return await handleAgentDecision(msg.payload);
    }

    case 'GET_AGENT_STATE': {
      const state = await loadAgentState();
      return { success: true, state };
    }

    case 'RESET_AGENT_STATE': {
      const state = await resetAgentState();
      return { success: true, state };
    }

    // Local User Profile (Slice 4.1)
    case 'GET_PROFILE': {
      const profile = await getProfile();
      return { success: true, profile };
    }

    case 'SAVE_PROFILE': {
      const updated = await saveProfile(msg.payload?.profile || {});
      return { success: true, profile: updated };
    }

    // One-Click Skills (Slice 4.2)
    case 'GET_SKILLS': {
      const skills = await getSkills();
      return { success: true, skills };
    }

    case 'SAVE_SKILLS': {
      await saveSkills(msg.payload?.skills || []);
      return { success: true };
    }

    case 'RUN_SKILL': {
      return await handleRunSkill(msg.payload);
    }

        // case 'SUMMARISE_YOUTUBE': return handleYouTubeSummarise(msg.payload);

    default:
      console.warn('[Sahayak SW] Unknown message type:', msg.type);
      return { success: false, error: `Unknown message type: ${msg.type}` };
  }
}

// ============================================================
// Helpers for Tab & Content Extraction
// ============================================================
function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'devtools:', 'about:', 'view-source:'];
  return restrictedProtocols.some((protocol) => url.startsWith(protocol));
}

async function findTargetTab(requestedTabId = null) {
  if (requestedTabId) {
    return await chrome.tabs.get(requestedTabId);
  }

  // 1. Try active tab in the last focused window
  const focusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focusedTabs.length > 0 && focusedTabs[0].url && !isRestrictedUrl(focusedTabs[0].url)) {
    return focusedTabs[0];
  }

  // 2. Try active tab across all windows
  const allActiveTabs = await chrome.tabs.query({ active: true });
  const activeWebTab = allActiveTabs.find((t) => t.url && !isRestrictedUrl(t.url));
  if (activeWebTab) {
    return activeWebTab;
  }

  // 3. Fallback: Find ANY open regular website tab (e.g. if user is on chrome://extensions)
  const webTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  if (webTabs.length > 0) {
    // Pick the most recently accessed tab
    webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return webTabs[0];
  }

  return null;
}

async function ensureContentScriptsInTab(targetTabId) {
  try {
    const check = await chrome.tabs.sendMessage(targetTabId, { type: 'CHECK_SCANNER' });
    if (check && check.ready) return true;
  } catch (e) {
    // Need injection
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: [
        'lib/Readability.js',
        'content/readability-wrapper.js',
        'content/element-scanner.js',
        'content/element-badges.js',
        'content/action-executor.js',
        'content/content-script.js'
      ],
    });
    return true;
  } catch (err) {
    console.error('[Sahayak SW] Dynamic script injection failed:', err);
    throw new Error('Failed to initialize page scripts: ' + err.message);
  }
}

async function extractContentFromTab(tabId = null) {
  const targetTab = await findTargetTab(tabId);

  if (!targetTab || !targetTab.id) {
    throw new Error(
      'No active web page found. Please open a website tab (e.g. Wikipedia or an article) before running extraction. Internal browser pages like chrome:// cannot be extracted.'
    );
  }

  const targetTabId = targetTab.id;

  // Attempt 1: Message the existing content script
  try {
    const response = await chrome.tabs.sendMessage(targetTabId, { type: 'EXTRACT_CONTENT' });
    if (response) return response;
  } catch (err) {
    // Content script not yet present; inject dynamically
  }

  // Attempt 2: Dynamically inject dependencies and retry
  try {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      files: ['lib/Readability.js', 'content/readability-wrapper.js', 'content/content-script.js'],
    });

    const response = await chrome.tabs.sendMessage(targetTabId, { type: 'EXTRACT_CONTENT' });
    if (response) return response;
    return { success: false, error: 'Empty response received from content script.' };
  } catch (injectErr) {
    console.error('[Sahayak SW] Dynamic injection failed:', injectErr);
    return { success: false, error: `Content extraction failed: ${injectErr.message}` };
  }
}

// Expose for DevTools testing in service worker console
globalThis.extractContentFromTab = extractContentFromTab;
globalThis.handleMessage = handleMessage;
globalThis.callModel = callModel;
// ============================================================
// Article Summarisation Handler (Slice 1.5)
// ============================================================
async function handleSummarise(payload = {}) {
  const targetTab = await findTargetTab(payload.tabId);

  if (!targetTab || !targetTab.url) {
    throw new Error('No active webpage found to summarise. Please open an article or YouTube video first.');
  }

  // Automatic YouTube detection
  const ytInfo = parseYouTubeUrl(payload.url || targetTab.url);
  if (ytInfo && ytInfo.isYouTube) {
    return await handleYouTubeSummarise({ ...payload, tabId: targetTab.id, url: payload.url || targetTab.url });
  }

  // Edge Case 3.3: PDF check
  const lowerUrl = targetTab.url.toLowerCase();
  if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('/pdf/') || lowerUrl.includes('.pdf?')) {
    throw new Error('PDF summarisation is not supported yet. Please navigate to a standard HTML article.');
  }

  const lang = payload.language || (await getLanguage());

  // Check 30-min cache
  const cacheKey = `summary_${targetTab.url}_${lang}`;
  if (!payload.forceRefresh) {
    const cached = await getCachedItem(cacheKey);
    if (cached) {
      return {
        success: true,
        summary: cached.summary,
        title: cached.title || targetTab.title || 'Article Summary',
        url: targetTab.url,
        fromCache: true,
      };
    }
  }

  // Extract page content
  let extracted;
  if (payload.text && typeof payload.text === 'string' && payload.text.trim().length > 50) {
    extracted = {
      title: payload.title || targetTab.title || 'Article',
      text: payload.text.trim(),
      url: targetTab.url,
    };
  } else {
    const extractRes = await extractContentFromTab(targetTab.id);
    if (!extractRes || !extractRes.success || !extractRes.data) {
      throw new Error(extractRes?.error || 'Could not extract content from the current page.');
    }
    extracted = extractRes.data;
  }

  if (!extracted.text || extracted.text.trim().length < 100) {
    throw new Error('No readable article text found on this page. Try Screenshot-and-Ask instead.');
  }

  // Construct prompt & invoke Gemini
  const prompt = buildSummaryPrompt(extracted.text, lang);
  const summaryText = await callModel({ prompt, model: 'flash-lite' });

  const result = {
    summary: summaryText,
    title: extracted.title || targetTab.title || 'Article Summary',
    url: targetTab.url,
  };

  // Cache result for 30 minutes
  await setCachedItem(cacheKey, result, 30 * 60 * 1000);

  return {
    success: true,
    ...result,
  };
}

globalThis.handleSummarise = handleSummarise;
// ============================================================
// YouTube URL Parser Helper (Slice 1.6)
// ============================================================
function parseYouTubeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
      return null;
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      const videoId = parsed.pathname.replace('/shorts/', '').split('/')[0].split('?')[0];
      return { isYouTube: true, videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}`, isShorts: true };
    }

    if (host.includes('youtu.be')) {
      const videoId = parsed.pathname.replace('/', '').split('?')[0];
      return { isYouTube: true, videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
    }

    const videoId = parsed.searchParams.get('v');
    if (videoId) {
      return { isYouTube: true, videoId, cleanUrl: `https://www.youtube.com/watch?v=${videoId}` };
    }

    if (parsed.searchParams.get('list')) {
      return { isYouTube: true, isPlaylistOnly: true };
    }

    return { isYouTube: true, videoId: null };
  } catch {
    return null;
  }
}

// ============================================================
// YouTube Video Summarisation Handler (Slice 1.6)
// ============================================================
async function handleYouTubeSummarise(payload = {}) {
  let targetUrl = payload.url;
  let targetTab = null;

  if (!targetUrl) {
    targetTab = await findTargetTab(payload.tabId);
    targetUrl = targetTab?.url;
  } else if (payload.tabId) {
    targetTab = await chrome.tabs.get(payload.tabId).catch(() => null);
  }

  if (!targetUrl) {
    throw new Error('No YouTube URL or active YouTube video found.');
  }

  const ytInfo = parseYouTubeUrl(targetUrl);
  if (!ytInfo || !ytInfo.isYouTube) {
    throw new Error('The specified link is not a recognized YouTube video URL.');
  }

  // Edge Case 5.3: Playlist without specific video
  if (ytInfo.isPlaylistOnly) {
    throw new Error('Please select or open a specific video from the playlist to summarise.');
  }

  const cleanUrl = ytInfo.cleanUrl || targetUrl;
  const lang = payload.language || (await getLanguage());

  // Check 30-min cache
  const cacheKey = `summary_yt_${cleanUrl}_${lang}`;
  if (!payload.forceRefresh) {
    const cached = await getCachedItem(cacheKey);
    if (cached) {
      return {
        success: true,
        isYouTube: true,
        summary: cached.summary,
        title: cached.title || 'YouTube Video Summary',
        url: cleanUrl,
        fromCache: true,
      };
    }
  }

  // Extract metadata if available from tab
  let meta = {};
  if (targetTab && targetTab.id) {
    try {
      const extractRes = await extractContentFromTab(targetTab.id);
      if (extractRes && extractRes.data) {
        meta = extractRes.data;
      }
    } catch {
      // Tab metadata optional
    }
  }

  // Build YouTube prompt & call model
  const prompt = buildYouTubePrompt(cleanUrl, lang, meta);
  const summaryText = await callModel({ prompt, model: 'flash-lite' });

  const result = {
    summary: summaryText,
    title: meta.title || targetTab?.title || 'YouTube Video Summary',
    url: cleanUrl,
  };

  // Cache result for 30 minutes
  await setCachedItem(cacheKey, result, 30 * 60 * 1000);

  return {
    success: true,
    isYouTube: true,
    ...result,
  };
}

globalThis.handleYouTubeSummarise = handleYouTubeSummarise;
// ============================================================
// Grounded Page Chat Handler (Slice 2.1)
// ============================================================
async function handlePageChat(payload = {}) {
  const { query, history = [], tabId, language } = payload;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Please type a question before sending.');
  }

  const lang = language || (await getLanguage());

  // Extract current page content
  const extractRes = await extractContentFromTab(tabId || null);
  if (!extractRes || !extractRes.success || !extractRes.data) {
    throw new Error(extractRes?.error || 'Could not read the current page. Please make sure you are on a webpage.');
  }

  const { text: pageText } = extractRes.data;
  if (!pageText || pageText.trim().length < 50) {
    throw new Error('This page does not have enough readable content to chat about.');
  }

  const prompt = buildChatPrompt(pageText, history, query.trim(), lang);
  const answer = await callModel({ prompt, model: 'flash-lite' });

  return {
    success: true,
    answer,
    query: query.trim(),
  };
}

globalThis.handlePageChat = handlePageChat;

// ============================================================
// Context Action Request Handler (Slice 2.2)
// Handles Explain / Translate / Draft from background process
// ============================================================
async function handleContextActionRequest(payload = {}) {
  const { action, text, language } = payload;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('No text was selected. Please select some text on the page and try again.');
  }

  if (!['sahayak-explain', 'sahayak-translate', 'sahayak-draft'].includes(action)) {
    throw new Error(`Unknown context action: ${action}`);
  }

  const lang = language || (await getLanguage());
  const prompt = buildContextActionPrompt(action, text.trim(), lang);
  const result = await callModel({ prompt, model: 'flash-lite' });

  const actionLabels = {
    'sahayak-explain': 'Explanation',
    'sahayak-translate': 'Translation',
    'sahayak-draft': 'Draft Reply',
  };

  return {
    success: true,
    action,
    label: actionLabels[action] || 'Result',
    result,
    originalText: text.trim(),
  };
}

globalThis.handleContextActionRequest = handleContextActionRequest;

// ============================================================
// Screenshot Capture Handler (Slice 2.3)
// ============================================================
async function handleCaptureScreenshot(payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.windowId) {
    throw new Error('No active browser tab found to screenshot.');
  }
  if (isRestrictedUrl(tab.url)) {
    throw new Error('Cannot screenshot Chrome internal pages. Please navigate to a normal website.');
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const base64 = dataUrl.split(',')[1];
  return { success: true, data: { base64, tabTitle: tab.title || '' } };
}

globalThis.handleCaptureScreenshot = handleCaptureScreenshot;

// ============================================================
// Screenshot Visual Q&A Handler (Slice 2.3)
// ============================================================
async function handleScreenshotAsk(payload = {}) {
  const { base64, query, language } = payload;

  if (!base64) {
    throw new Error('No screenshot data provided.');
  }
  if (!query || query.trim().length === 0) {
    throw new Error('Please enter a question about the screenshot.');
  }

  const lang = language || (await getLanguage());
  let langInstruction = '';
  if (lang === 'hinglish') {
    langInstruction = ' Respond in HINGLISH (Hindi + English code-mix in English letters).';
  } else if (lang === 'tanglish' || lang === 'tan') {
    langInstruction = ' Respond in TANGLISH (Tamil + English code-mix in English letters).';
  }

  const prompt = 'You are Sahayak, an AI browser assistant.' + langInstruction + ' Look at this screenshot and answer the following question clearly and concisely:\n\n' + query.trim();
  const answer = await callModel({ prompt, model: 'flash', image: base64 });

  return { success: true, answer };
}

globalThis.handleScreenshotAsk = handleScreenshotAsk;



// ============================================================
// Interactive Element Scanner & Badges Handler (Slice 3.1)
// ============================================================
async function handleScanPageElements(payload = {}) {
  const targetTab = await findTargetTab(payload.tabId);
  if (!targetTab || !targetTab.url) {
    throw new Error('No active webpage found to scan. Please navigate to a webpage first.');
  }
  if (isRestrictedUrl(targetTab.url)) {
    throw new Error('Cannot scan elements on Chrome internal or system pages (chrome://).');
  }

  await ensureContentScriptsInTab(targetTab.id);

  const res = await chrome.tabs.sendMessage(targetTab.id, {
    type: 'SCAN_ELEMENTS',
    payload: { renderBadges: payload.renderBadges !== false }
  });

  return res || { success: false, error: 'Failed to scan page elements.' };
}

async function handleClearElementBadges(payload = {}) {
  const targetTab = await findTargetTab(payload.tabId);
  if (!targetTab || !targetTab.id) return { success: true };
  try {
    await chrome.tabs.sendMessage(targetTab.id, { type: 'CLEAR_BADGES' });
  } catch (e) {
    // Ignore if tab closed or reloaded
  }
  return { success: true };
}

async function handleHighlightPageElement(payload = {}) {
  const targetTab = await findTargetTab(payload.tabId);
  if (!targetTab || !targetTab.id) throw new Error('No active webpage found.');
  const res = await chrome.tabs.sendMessage(targetTab.id, {
    type: 'HIGHLIGHT_ELEMENT',
    elementId: payload.elementId
  });
  return res || { success: false };
}

// ============================================================
// Find It For Me Handler (Slice 3.2)
// ============================================================
async function handleFindElement(payload = {}) {
  const { query, language, tabId } = payload;
  if (!query || !query.trim()) {
    throw new Error('Please enter a description of what you are looking for.');
  }

  const targetTab = await findTargetTab(tabId);
  if (!targetTab || !targetTab.url) {
    throw new Error('No active webpage found.');
  }
  if (isRestrictedUrl(targetTab.url)) {
    throw new Error('Cannot locate elements on Chrome internal or system pages.');
  }

  await ensureContentScriptsInTab(targetTab.id);

  // 1. Scan page elements and render badges
  const scanRes = await chrome.tabs.sendMessage(targetTab.id, {
    type: 'SCAN_ELEMENTS',
    payload: { renderBadges: true }
  });

  if (!scanRes || !scanRes.success || !scanRes.elements || scanRes.elements.length === 0) {
    return {
      success: false,
      error: 'No interactive elements found on this page.'
    };
  }

  // 2. Build element selection prompt
  const prompt = buildElementSelectPrompt(scanRes.actionMapText, query.trim());

  // 3. Call AI model
  const rawResponse = await callModel({ prompt, model: 'flash' });

  // 4. Parse model response JSON
  let parsed = null;
  try {
    const cleaned = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(cleaned);
    }
  } catch (err) {
    console.warn('[Sahayak SW] Failed to parse model JSON for element selection:', rawResponse, err);
    throw new Error('Could not parse model response. Please try rephrasing your search.');
  }

  // 5. Validate & Highlight
  if (parsed && typeof parsed.element === 'number' && parsed.element > 0) {
    const elNum = parsed.element;
    const targetElement = scanRes.elements.find(e => e.id === elNum);

    if (targetElement) {
      // Highlight on live webpage
      await chrome.tabs.sendMessage(targetTab.id, {
        type: 'HIGHLIGHT_ELEMENT',
        elementId: elNum
      });

      return {
        success: true,
        element: elNum,
        reason: parsed.reason || 'Found matching element on the page.',
        label: targetElement.label,
        tag: targetElement.tag,
        type: targetElement.type,
        totalElements: scanRes.elements.length
      };
    } else {
      return {
        success: true,
        element: null,
        reason: 'Sahayak could not find a matching element on the page. Try rephrasing.'
      };
    }
  }

  return {
    success: true,
    element: null,
    reason: parsed?.reason || 'Sahayak could not find a matching element. Try rephrasing.'
  };
}

globalThis.handleScanPageElements = handleScanPageElements;
globalThis.handleClearElementBadges = handleClearElementBadges;
globalThis.handleHighlightPageElement = handleHighlightPageElement;
globalThis.handleFindElement = handleFindElement;

// Agent state recovery on browser startup (Slice 3.4)
chrome.runtime.onStartup.addListener(async () => {
  const state = await loadAgentState();
  if (state.status === 'awaiting_approval' && state.pendingAction) {
    safeBroadcastMessage({
      type: 'AWAITING_APPROVAL',
      step: state.stepIndex + 1,
      totalSteps: state.stepLimit,
      action: state.pendingAction,
      targetDesc: state.pendingTargetDesc,
      requiresExtraConfirm: state.requiresExtraConfirm,
    });
  }
});

// ============================================================
// One-Click Skills Runner (Slice 4.2)
// ============================================================
async function handleRunSkill(payload = {}) {
  const { skill, tabId } = payload;
  if (!skill || !skill.prompt) {
    throw new Error('Invalid skill definition.');
  }

  const targetTab = await findTargetTab(tabId);
  if (!targetTab || !targetTab.url) {
    throw new Error('No active webpage found.');
  }
  if (isRestrictedUrl(targetTab.url)) {
    throw new Error('Skills cannot run on Chrome internal or system pages.');
  }

  const scope = skill.scope || 'page';

  // 1. Selection Scope
  if (scope === 'selection') {
    let selText = payload.selectionText;
    if (!selText) {
      await ensureContentScriptsInTab(targetTab.id);
      const selRes = await chrome.tabs.sendMessage(targetTab.id, { type: 'GET_SELECTION' }).catch(() => null);
      selText = selRes?.text?.trim();
    }
    if (!selText) {
      return { success: false, error: 'Please select some text on the webpage before running this skill.' };
    }

    const prompt = `You are Sahayak. ${skill.prompt}\n\nSelected text:\n"""\n${selText}\n"""`;
    const result = await callModel({ prompt, model: 'flash-lite' });
    return { success: true, scope: 'selection', result, skillName: skill.name };
  }

  // 2. Agent Scope
  if (scope === 'agent') {
    await ensureContentScriptsInTab(targetTab.id);
    await startAgentTask(skill.prompt, targetTab.id);
    return { success: true, scope: 'agent', message: 'Agent task started for skill: ' + skill.name };
  }

  // 3. Page Scope
  await ensureContentScriptsInTab(targetTab.id);
  const contentRes = await extractContentFromTab(targetTab.id);
  if (!contentRes || !contentRes.success || !contentRes.data) {
    throw new Error('Failed to extract page content for skill execution.');
  }
  const pageText = (contentRes.data.text || '').substring(0, 12000);
  const prompt = `You are Sahayak, an AI browser assistant.\nTask/Skill: "${skill.prompt}"\n\nPage Content:\n"""\n${pageText}\n"""\n\nProvide the response clearly and concisely:`;
  const result = await callModel({ prompt, model: 'flash-lite' });
  return { success: true, scope: 'page', result, skillName: skill.name };
}

globalThis.handleRunSkill = handleRunSkill;
