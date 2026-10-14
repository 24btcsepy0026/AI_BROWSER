// ============================================================
// Sahayak â€“ Storage Manager (background/storage-manager.js)
// Centralized, promise-based wrapper over chrome.storage.local
// Used by Service Worker, side panel, and settings page.
// ============================================================

export const STORAGE_KEYS = {
  GEMINI_API_KEY: 'geminiApiKey',
  GROQ_API_KEY: 'groqApiKey',
  LANGUAGE: 'language',
  TONE: 'tone',
  MODEL_PROVIDER: 'modelProvider', // 'gemini' | 'groq'
  CACHED_SUMMARIES: 'cachedSummaries',
  SAVED_SKILLS: 'savedSkills',
};

const DEFAULT_PREFERENCES = {
  language: 'en',
  tone: 'professional',
  modelProvider: 'gemini',
};

/**
 * Retrieve an API key for the specified provider.
 * @param {'gemini' | 'groq'} provider
 * @returns {Promise<string | null>}
 */
export async function getApiKey(provider = 'gemini') {
  const key = provider === 'gemini' ? STORAGE_KEYS.GEMINI_API_KEY : STORAGE_KEYS.GROQ_API_KEY;
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return value && typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Save an API key for the specified provider.
 * @param {'gemini' | 'groq'} provider
 * @param {string} value
 */
export async function setApiKey(provider, value) {
  const key = provider === 'gemini' ? STORAGE_KEYS.GEMINI_API_KEY : STORAGE_KEYS.GROQ_API_KEY;
  const cleanValue = typeof value === 'string' ? value.trim() : '';
  await chrome.storage.local.set({ [key]: cleanValue });
}

/**
 * Check if a provider has an API key configured.
 * @param {'gemini' | 'groq'} provider
 * @returns {Promise<boolean>}
 */
export async function hasApiKey(provider = 'gemini') {
  const key = await getApiKey(provider);
  return Boolean(key && key.length > 0);
}

/**
 * Get current language setting ('en' | 'hinglish').
 * @returns {Promise<string>}
 */
export async function getLanguage() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE);
  return result[STORAGE_KEYS.LANGUAGE] || DEFAULT_PREFERENCES.language;
}

/**
 * Update current language setting ('en' | 'hinglish').
 * @param {'en' | 'hinglish'} lang
 */
export async function setLanguage(lang) {
  const validLang = (lang === 'hinglish' || lang === 'tanglish') ? lang : 'en';
  await chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: validLang });
}

/**
 * Get current tone setting ('professional' | 'casual' | 'friendly').
 * @returns {Promise<string>}
 */
export async function getTone() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TONE);
  return result[STORAGE_KEYS.TONE] || DEFAULT_PREFERENCES.tone;
}

/**
 * Update tone preference.
 * @param {'professional' | 'casual' | 'friendly'} tone
 */
export async function setTone(tone) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TONE]: tone });
}

/**
 * Get all user settings at once.
 */
export async function getAllSettings() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.GEMINI_API_KEY,
    STORAGE_KEYS.GROQ_API_KEY,
    STORAGE_KEYS.LANGUAGE,
    STORAGE_KEYS.TONE,
    STORAGE_KEYS.MODEL_PROVIDER,
  ]);

  return {
    geminiApiKey: data[STORAGE_KEYS.GEMINI_API_KEY] || '',
    groqApiKey: data[STORAGE_KEYS.GROQ_API_KEY] || '',
    language: data[STORAGE_KEYS.LANGUAGE] || DEFAULT_PREFERENCES.language,
    tone: data[STORAGE_KEYS.TONE] || DEFAULT_PREFERENCES.tone,
    modelProvider: data[STORAGE_KEYS.MODEL_PROVIDER] || DEFAULT_PREFERENCES.modelProvider,
  };
}

/**
 * Batch update settings.
 * @param {Object} newSettings
 */
export async function saveAllSettings(newSettings = {}) {
  const toSave = {};
  if (typeof newSettings.geminiApiKey === 'string') {
    toSave[STORAGE_KEYS.GEMINI_API_KEY] = newSettings.geminiApiKey.trim();
  }
  if (typeof newSettings.groqApiKey === 'string') {
    toSave[STORAGE_KEYS.GROQ_API_KEY] = newSettings.groqApiKey.trim();
  }
  if (newSettings.language) {
    toSave[STORAGE_KEYS.LANGUAGE] = (newSettings.language === 'hinglish' || newSettings.language === 'tanglish') ? newSettings.language : 'en';
  }
  if (newSettings.tone) {
    toSave[STORAGE_KEYS.TONE] = newSettings.tone;
  }
  if (newSettings.modelProvider) {
    toSave[STORAGE_KEYS.MODEL_PROVIDER] = newSettings.modelProvider;
  }

  await chrome.storage.local.set(toSave);
}

/**
 * Simple cache helper for page summaries / AI outputs.
 * Expire items after ttlMs (default 30 mins).
 */
export async function getCachedItem(key) {
  try {
    const raw = await chrome.storage.local.get(key);
    const entry = raw[key];
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await chrome.storage.local.remove(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export async function setCachedItem(key, value, ttlMs = 30 * 60 * 1000) {
  try {
    await chrome.storage.local.set({
      [key]: {
        value,
        savedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      },
    });
  } catch (err) {
    console.warn('[StorageManager] Failed to cache item:', err);
  }
}
