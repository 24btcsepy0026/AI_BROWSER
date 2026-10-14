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
  console.log('[Sahayak] Context action received:', payload?.action);
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
    showError(err.message || 'Could not summarise this page.');
  } finally {
    setLoading(false);
  }
}

async function handleScreenshot() { showError('Screenshot will be ready in Slice 2.3 Ã°Å¸â€œÂ¸'); }
async function handleExplain()    { showError('Explain will be ready in Slice 2.2 Ã°Å¸â€™Â¡'); }
async function handleTranslate()  { showError('Translate will be ready in Slice 2.2 Ã°Å¸Å’Â'); }
async function handleDraft()      { showError('Draft Reply will be ready in Slice 2.2 Ã¢Å“ÂÃ¯Â¸Â'); }
async function handleFind()       { showError('Find It will be ready in Slice 3.2 Ã°Å¸â€Â'); }
async function handleChatSend()   { showError('Page Chat will be ready in Slice 2.1 Ã°Å¸â€™Â¬'); }
async function handleAgentStart() { showError('Agent Loop will be ready in Slice 3.3 Ã¢Å¡Â¡'); }

async function sendAgentDecision(decision) {
  await sendToSW('AGENT_DECISION', { decision }).catch(showError);
}