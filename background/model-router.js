// ============================================================
// Sahayak - Model Router (background/model-router.js)
// Central gateway for all AI model calls (Gemini & Groq fallback).
// Handles key retrieval, retries, 429 exponential backoff, and timeouts.
// ============================================================

import { getApiKey } from './storage-manager.js';

export const MODELS = {
  'flash-lite': 'gemini-flash-lite-latest',
  'flash': 'gemini-3.5-flash-lite',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',
};

const GEMINI_FALLBACKS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
];

const GROQ_MODEL = 'llama-3.1-8b-instant';

/**
 * Call Gemini model with automatic retry on 429, multi-model fallback, and Groq backup.
 *
 * @param {Object} options
 * @param {string} options.prompt - Prompt text to send
 * @param {'flash-lite' | 'flash'} [options.model='flash-lite'] - Model choice
 * @param {string | null} [options.image=null] - Base64 encoded image string (optional)
 * @param {number} [options.timeoutMs=30000] - Request timeout in ms
 * @returns {Promise<string>} The generated text response
 */
export async function callModel({ prompt, model = 'flash-lite', image = null, timeoutMs = 30000 }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('A valid prompt string is required.');
  }

  const apiKey = await getApiKey('gemini');
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please open Sahayak Settings and add your API key.');
  }

  const parts = [{ text: prompt }];
  if (image) {
    const cleanBase64 = image.includes(',') ? image.split(',')[1] : image;
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: cleanBase64,
      },
    });
  }

  const requestBody = { contents: [{ parts }] };

  // Try requested model first, then fallback models on quota exhaustion (429)
  const initialModelId = MODELS[model] || 'gemini-flash-lite-latest';
  const modelsToTry = [initialModelId, ...GEMINI_FALLBACKS.filter((m) => m !== initialModelId)];

  let lastError = null;

  for (const modelId of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.status === 429) {
          console.warn(`[Sahayak ModelRouter] Model ${modelId} rate limited (429). Trying next candidate...`);
          break; // break to try next model in modelsToTry
        }

        if (!res.ok) {
          let errorMsg = `Model API error (${res.status})`;
          try {
            const errData = await res.json();
            errorMsg = errData?.error?.message || errorMsg;
          } catch {}
          throw new Error(errorMsg);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof text !== 'string') {
          throw new Error('Received empty response from model.');
        }

        return text.trim();
      } catch (err) {
        if (err.name === 'AbortError') {
          lastError = new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
        } else {
          lastError = err;
        }

        if (err.message && (err.message.includes('API_KEY_INVALID') || err.message.includes('API key not valid'))) {
          throw new Error('Your Gemini API key appears to be invalid. Please check your key in Settings.');
        }
      }
    }
  }

  console.warn('[Sahayak ModelRouter] All Gemini models exhausted. Trying Groq fallback...');
  return await callGroqFallback(prompt, lastError);
}

/**
 * Fallback to Groq if Gemini hits rate limits or fails.
 */
async function callGroqFallback(prompt, primaryError) {
  const groqKey = await getApiKey('groq');
  if (!groqKey) {
    throw new Error(
      `Gemini request failed (${primaryError?.message || 'Rate limit / quota exceeded'}). Add a secondary Groq API key in Settings for automatic backup.`
    );
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error (${res.status})`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Empty response received from Groq fallback.');
    }

    return content.trim();
  } catch (groqErr) {
    throw new Error(
      `All AI providers failed. Gemini: ${primaryError?.message || 'unavailable'}. Groq fallback: ${groqErr.message}`
    );
  }
}