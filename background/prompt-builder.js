// ============================================================
// Sahayak - Prompt Builder (background/prompt-builder.js)
// Constructs structured prompts for all AI tasks.
// Handles language preferences: English, Hinglish, & Tanglish (TAN).
// ============================================================

/**
 * Builds the prompt for article summarisation.
 *
 * @param {string} text - Clean article text
 * @param {'en' | 'hinglish' | 'tanglish'} [lang='en'] - Preferred language
 * @returns {string} Prompt string
 */
export function buildSummaryPrompt(text, lang = 'en') {
  if (lang === 'tanglish' || lang === 'tan') {
    return `You are Sahayak, an intelligent AI browser assistant.
CRITICAL INSTRUCTION: The user wants this summary in TANGLISH (Tamil + English code-mix written in English letters, e.g. "Indha article-la mukkiyamana points enna-na...", "Idhula explain panranga...").
DO NOT write sentences in plain English! Every single point, TL;DR, and next step MUST be in conversational Tanglish. Keep technical terms, names, and numbers in English. Do NOT use Tamil script.

Summarise the article below in TANGLISH. Format EXACTLY as:

**TL;DR:** <One sentence in Tanglish>

**Key Points:**
1. <Point 1 in Tanglish>
2. <Point 2 in Tanglish>
3. <Point 3 in Tanglish>
4. <Point 4 in Tanglish>
5. <Point 5 in Tanglish>

**What to do next:** <One suggestion in Tanglish>

Article Content:
---
${text}
---
MANDATORY: Output MUST be entirely in TANGLISH (Latin script). No plain English sentences allowed.`;
  }

  if (lang === 'hinglish') {
    return `You are Sahayak, an intelligent AI browser assistant.
CRITICAL INSTRUCTION: The user wants this summary in HINGLISH (Hindi + English code-mix written in English letters, e.g. "Yeh article explain karta hai...", "Iske main points yeh hain...").
DO NOT write sentences in plain English! Every single point, TL;DR, and next step MUST be in conversational Hinglish. Keep technical terms, names, and numbers in English. Do NOT use Devanagari script.

Summarise the article below in HINGLISH. Format EXACTLY as:

**TL;DR:** <One sentence in Hinglish>

**Key Points:**
1. <Point 1 in Hinglish>
2. <Point 2 in Hinglish>
3. <Point 3 in Hinglish>
4. <Point 4 in Hinglish>
5. <Point 5 in Hinglish>

**What to do next:** <One suggestion in Hinglish>

Article Content:
---
${text}
---
MANDATORY: Output MUST be entirely in HINGLISH (Latin script). No plain English sentences allowed.`;
  }

  return `You are Sahayak, an intelligent AI browser assistant. Respond in clear, concise English.

Summarise the article below. Structure your response EXACTLY as:

**TL;DR:** <A crisp 1-sentence summary>

**Key Points:**
1. <Key point 1>
2. <Key point 2>
3. <Key point 3>
4. <Key point 4>
5. <Key point 5>

**What to do next:** <One practical suggestion>

Article Content:
---
${text}`;
}

/**
 * Builds the prompt for YouTube video summarisation.
 *
 * @param {string} url - YouTube URL
 * @param {'en' | 'hinglish' | 'tanglish'} [lang='en'] - Preferred language
 * @param {Object} [meta={}] - Optional video metadata (title, channel, description)
 * @returns {string} Prompt string
 */
export function buildYouTubePrompt(url, lang = 'en', meta = {}) {
  const metaContext = meta.title ? `Title: "${meta.title}". Channel: "${meta.channel || 'Unknown'}".\n` : '';

  if (lang === 'tanglish' || lang === 'tan') {
    return `You are Sahayak, an AI browser assistant.
CRITICAL INSTRUCTION: The user wants this video summary in TANGLISH (Tamil + English code-mix in Latin/English letters, e.g. "Indha video-la...", "Idhu pathi solranga...").
DO NOT write sentences in plain English! Every point, chapter note description, and takeaway MUST be written in Tanglish. Keep proper nouns and technical terms in English. Do NOT use Tamil script.

The user is watching: ${url}
${metaContext}
Provide a structured summary in TANGLISH:
1. **TL;DR:** <One crisp sentence in Tanglish>
2. **Chapter Notes:**
- [00:00] <Topic/Section in Tanglish>
- [MM:SS] <Section description in Tanglish>
- [MM:SS] <Section description in Tanglish>
(Provide 3 to 6 chapter notes with timestamps in [MM:SS] format)
3. **Key Takeaways:**
1. <Takeaway 1 in Tanglish>
2. <Takeaway 2 in Tanglish>
3. <Takeaway 3 in Tanglish>

MANDATORY: The entire response MUST be in TANGLISH using English letters. Do NOT output pure English sentences.`;
  }

  if (lang === 'hinglish') {
    return `You are Sahayak, an AI browser assistant.
CRITICAL INSTRUCTION: The user wants this video summary in HINGLISH (Hindi + English code-mix in Latin/English letters, e.g. "Yeh video discuss karta hai...", "Is video mein bataya gaya hai...").
DO NOT write sentences in plain English! Every point, chapter note description, and takeaway MUST be written in Hinglish. Keep proper nouns and technical terms in English. Do NOT use Devanagari script.

The user is watching: ${url}
${metaContext}
Provide a structured summary in HINGLISH:
1. **TL;DR:** <One crisp sentence in Hinglish>
2. **Chapter Notes:**
- [00:00] <Topic/Section in Hinglish>
- [MM:SS] <Section description in Hinglish>
- [MM:SS] <Section description in Hinglish>
(Provide 3 to 6 chapter notes with timestamps in [MM:SS] format)
3. **Key Takeaways:**
1. <Takeaway 1 in Hinglish>
2. <Takeaway 2 in Hinglish>
3. <Takeaway 3 in Hinglish>

MANDATORY: The entire response MUST be in HINGLISH using English letters. Do NOT output pure English sentences.`;
  }

  return `You are Sahayak, a helpful browser assistant. Respond in clear English.

The user is watching: ${url}
${metaContext}
Provide a structured summary:
1. **TL;DR:** One crisp sentence summarising the core thesis.
2. **Chapter Notes:** Key topics with estimated timestamps in [MM:SS] format.
3. **Key Takeaways:** 3 to 5 actionable bullet points.`;
}