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
// ============================================================
// Chat Prompt Builder (Slice 2.1 - Grounded Page Chat)
// ============================================================

/**
 * Builds the prompt for grounded page chat.
 * Answers must come ONLY from the page content provided.
 *
 * @param {string} pageText - Clean page text (trimmed to 12000 chars)
 * @param {Array<{role: string, content: string}>} history - Conversation history
 * @param {string} query - User's current question
 * @param {'en' | 'hinglish' | 'tanglish'} [lang='en'] - Preferred language
 * @returns {string} Prompt string
 */
export function buildChatPrompt(pageText, history = [], query, lang = 'en') {
  let langInstruction;
  if (lang === 'hinglish') {
    langInstruction = 'Respond in HINGLISH (Hindi + English code-mix in English letters, e.g. "Yeh page mein bataya gaya hai ki..."). Do NOT use Devanagari script.';
  } else if (lang === 'tanglish' || lang === 'tan') {
    langInstruction = 'Respond in TANGLISH (Tamil + English code-mix in English letters, e.g. "Indha page-la solranga..."). Do NOT use Tamil script.';
  } else {
    langInstruction = 'Respond in clear, concise English.';
  }

  const historyText = history
    .map((h) => `${h.role === 'user' ? 'User' : 'Sahayak'}: ${h.content}`)
    .join('\n');

  // Trim page text to 12,000 chars from middle to preserve start/end context
  const trimmedText = pageText.length > 12000
    ? pageText.slice(0, 6000) + '\n...[content trimmed]...\n' + pageText.slice(-6000)
    : pageText;

  return `You are Sahayak, a grounded page assistant. ${langInstruction}

RULES:
- Answer ONLY from the page content provided below.
- If the answer is not on the page, say EXACTLY: "This information is not available on the current page."
- Do not guess, infer, or add any external information.
- Keep answers concise and relevant.

--- PAGE CONTENT ---
${trimmedText}
--- END ---

${historyText ? `Previous conversation:\n${historyText}\n\n` : ''}User: ${query}
Sahayak:`;
}

// ============================================================
// Context-Action Prompt Builder (Slice 2.2)
// ============================================================

/**
 * Builds the prompt for right-click context actions.
 *
 * @param {'sahayak-explain' | 'sahayak-translate' | 'sahayak-draft'} action
 * @param {string} selectedText - Text the user selected
 * @param {'en' | 'hinglish' | 'tanglish'} [lang='en'] - Preferred language
 * @returns {string} Prompt string
 */
export function buildContextActionPrompt(action, selectedText, lang = 'en') {
  let langInstruction;
  if (lang === 'hinglish') {
    langInstruction = 'Respond in HINGLISH (Hindi + English code-mix in English letters). No Devanagari script.';
  } else if (lang === 'tanglish' || lang === 'tan') {
    langInstruction = 'Respond in TANGLISH (Tamil + English code-mix in English letters). No Tamil script.';
  } else {
    langInstruction = 'Respond in clear, concise English.';
  }

  const truncated = selectedText.length > 3000 ? selectedText.slice(0, 3000) + '...' : selectedText;

  if (action === 'sahayak-explain') {
    return `You are Sahayak, an AI browser assistant. ${langInstruction}

Explain the following selected text in simple terms. Break down jargon, acronyms, and complex ideas so anyone can understand it. Keep the explanation concise (2-4 sentences or a short bullet list).

Selected text:
"""
${truncated}
"""

Explanation:`;
  }

  if (action === 'sahayak-translate') {
    return `You are Sahayak, an AI browser assistant. ${langInstruction}

Translate the following selected text to ${lang === 'hinglish' ? 'Hinglish (Hindi + English code-mix)' : lang === 'tanglish' || lang === 'tan' ? 'Tanglish (Tamil + English code-mix)' : 'simple, modern English (if it is in another language) or explain the meaning clearly if already in English'}.

Selected text:
"""
${truncated}
"""

Translation:`;
  }

  if (action === 'sahayak-draft') {
    return `You are Sahayak, an AI browser assistant. ${langInstruction}

Draft a professional, friendly reply to the following selected text. Keep it concise (2-4 sentences). The reply should be ready to copy and send.

Selected text:
"""
${truncated}
"""

Draft reply:`;
  }

  // Fallback
  return `You are Sahayak. ${langInstruction}\n\nProcess the following text:\n"""\n${truncated}\n"""`;
}
