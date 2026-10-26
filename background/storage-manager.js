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
  USER_PROFILE: 'userProfile',
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

// ============================================================
// Local User Profile (Slice 4.1)
// Stored strictly on device in chrome.storage.local
// ============================================================

export const DEFAULT_PROFILE = {
  name: '',
  college: '',
  skills: [],
  github: '',
  linkedin: '',
  preferredLanguage: 'en',
  preferredTone: 'professional',
  customFields: {},
};

/**
 * Retrieves the local user profile.
 * @returns {Promise<Object>}
 */
export async function getProfile() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
    return { ...DEFAULT_PROFILE, ...(data[STORAGE_KEYS.USER_PROFILE] || {}) };
  } catch (err) {
    return { ...DEFAULT_PROFILE };
  }
}

/**
 * Saves updates to the local user profile.
 * @param {Object} profileUpdates
 */
export async function saveProfile(profileUpdates = {}) {
  const current = await getProfile();
  const next = { ...current, ...profileUpdates };
  await chrome.storage.local.set({ [STORAGE_KEYS.USER_PROFILE]: next });
  return next;
}

// ============================================================
// One-Click Skills (Slice 4.2)
// Built-in recipes + custom user skills
// ============================================================

export const DEFAULT_STARTER_SKILLS = [
  {
    id: 'skill-exam-notes',
    name: 'Exam Notes',
    icon: '📚',
    scope: 'page',
    prompt: 'Generate clear, structured exam revision notes from this page. Include key concepts, core formulas/definitions, and 5 likely exam questions with concise answers.',
  },
  {
    id: 'skill-hinglish-explain',
    name: 'Explain in Hinglish',
    icon: '🎓',
    scope: 'page',
    prompt: 'Explain the core content of this page in Hinglish (Hindi + English code-mix in Latin script) for a college student in simple, friendly terms.',
  },
  {
    id: 'skill-reply-politely',
    name: 'Reply Politely',
    icon: '✉️',
    scope: 'selection',
    prompt: 'Draft a polite, constructive, and professional response to the selected message or email.',
  },
  {
    id: 'skill-fill-profile',
    name: 'Fill from Profile',
    icon: '📋',
    scope: 'agent',
    prompt: 'Fill in the form fields on this page using the user profile information.',
  },
];

/**
 * Retrieves all saved skills, seeding with default skills if empty.
 * @returns {Promise<Array>}
 */
export async function getSkills() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEYS.SAVED_SKILLS);
    const skills = res[STORAGE_KEYS.SAVED_SKILLS];
    if (Array.isArray(skills) && skills.length > 0) {
      return skills;
    }
    // Seed with defaults
    await chrome.storage.local.set({ [STORAGE_KEYS.SAVED_SKILLS]: DEFAULT_STARTER_SKILLS });
    return DEFAULT_STARTER_SKILLS;
  } catch (err) {
    return DEFAULT_STARTER_SKILLS;
  }
}

/**
 * Saves the full skills list to storage.
 * @param {Array} skills
 */
export async function saveSkills(skills = []) {
  if (!Array.isArray(skills)) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.SAVED_SKILLS]: skills });
}
