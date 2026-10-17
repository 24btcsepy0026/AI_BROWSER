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

export function showError(message) {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  banner.textContent = message;
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

      case 'AGENT_BLOCKED':
        showError(`Blocked: ${msg.reason}`);
        hideApprovalCard();
        setLoading(false);
        break;

      case 'AGENT_DONE':
        onAgentDone(msg.data);
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
function showApprovalCard(msg) {}
function hideApprovalCard() {
  document.getElementById('agent-approval-card')?.classList.add('hidden');
}
function onAgentDone(data) {
  hideApprovalCard();
  setLoading(false);
}
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

    const prefix = response.isYouTube ? 'Ã°Å¸Å½Â¬ ' : 'Ã°Å¸â€œâ€ž ';
    const defaultTitle = response.isYouTube
      ? (state.language === 'hinglish' ? 'Ã°Å¸Å½Â¬ YouTube Video Summary' : 'Ã°Å¸Å½Â¬ YouTube Summary')
      : (state.language === 'hinglish' ? 'Ã°Å¸â€œâ€ž Article Summary (Hinglish)' : 'Ã°Å¸â€œâ€ž Article Summary');

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
async function handleFind()       { showError('Find It will be ready in Slice 3.2 Ã°Å¸â€Â'); }
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
    appendChatMessage('assistant', '⚠️ ' + (err.message || 'Could not answer. Please try again.'));
  }
}
async function handleAgentStart() { showError('Agent Loop will be ready in Slice 3.3 Ã¢Å¡Â¡'); }

async function sendAgentDecision(decision) {
  await sendToSW('AGENT_DECISION', { decision }).catch(showError);
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
