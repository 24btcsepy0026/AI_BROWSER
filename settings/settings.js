// ============================================================
// Sahayak - Settings Page Logic (settings.js)
// Handles reading/writing user preferences and API keys
// to chrome.storage.local.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const geminiInput = document.getElementById('gemini-key');
  const groqInput = document.getElementById('groq-key');
  const langSelect = document.getElementById('lang-select');
  const toneSelect = document.getElementById('tone-select');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('save-status');

  // Load saved settings
  try {
    const data = await chrome.storage.local.get([
      'geminiApiKey',
      'groqApiKey',
      'language',
      'tone'
    ]);

    if (data.geminiApiKey) geminiInput.value = data.geminiApiKey;
    if (data.groqApiKey) groqInput.value = data.groqApiKey;
    if (data.language) langSelect.value = data.language;
    if (data.tone) toneSelect.value = data.tone;
  } catch (err) {
    console.error('[Sahayak Settings] Failed to load settings:', err);
    showStatus('Failed to load existing settings.', 'error');
  }

  // Password visibility toggles
  document.querySelectorAll('.toggle-vis-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? 'Show' : 'Hide';
      btn.setAttribute('aria-label', isPassword ? 'Show key' : 'Hide key');
    });
  });

  // Save Handler
  async function handleSave() {
    const geminiKey = geminiInput.value.trim();
    const groqKey = groqInput.value.trim();
    const language = langSelect.value;
    const tone = toneSelect.value;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    clearStatus();

    try {
      await chrome.storage.local.set({
        geminiApiKey: geminiKey,
        groqApiKey: groqKey,
        language: language,
        tone: tone
      });

      // Notify runtime so sidepanel and service worker can sync immediately
      try {
        await chrome.runtime.sendMessage({
          type: 'SETTINGS_UPDATED',
          payload: { language, tone, hasGeminiKey: Boolean(geminiKey) }
        });
      } catch {
        // Ignored if no receiver is active yet
      }

      if (!geminiKey) {
        showStatus('Saved! Note: Gemini key is required to use AI features.', 'error');
      } else {
        showStatus('Settings saved successfully!', 'success');
      }
    } catch (err) {
      console.error('[Sahayak Settings] Error saving settings:', err);
      showStatus('Failed to save settings: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }
  }

  saveBtn.addEventListener('click', handleSave);

  // Allow Ctrl+Enter or Enter in inputs to quickly save
  [geminiInput, groqInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    });
  });

  // Status helpers
  let statusTimer = null;

  function showStatus(message, type = 'success') {
    clearTimeout(statusTimer);
    statusEl.textContent = message;
    statusEl.className = `save-status ${type}`;
    statusEl.style.opacity = '1';

    statusTimer = setTimeout(() => {
      statusEl.style.opacity = '0';
    }, 4500);
  }

  function clearStatus() {
    clearTimeout(statusTimer);
    statusEl.textContent = '';
    statusEl.className = 'save-status';
    statusEl.style.opacity = '1';
  }
});