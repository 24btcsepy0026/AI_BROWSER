# Sahayak – Phase-Wise Implementation Plan

> **Chrome Side-Panel AI Browser Agent**
> 4 Phases | 4 Weeks | Build-in-Vertical-Slices Strategy

---

## How to Read This Plan

Each phase maps to one week of the build plan. Inside each phase:
- **Objective** – what capability is being unlocked
- **Slices** – smallest working vertical features to build in order
- **Per-Slice breakdown** – files to create, code to write, how to test
- **Acceptance gate** – exact criteria before moving to the next phase

> **Golden Rule:** Build the smallest working version of each slice, test it on a real page, then move on. Never generate the entire extension at once.

---

## Table of Contents

- [Phase 0 – Pre-Work and Setup](#phase-0--pre-work-and-setup)
- [Phase 1 – The Eyes: Read the Web (Week 1)](#phase-1--the-eyes-read-the-web-week-1)
- [Phase 2 – The Brain: Understand Page and Screen (Week 2)](#phase-2--the-brain-understand-page-and-screen-week-2)
- [Phase 3 – The Hands: Act With Approval (Week 3)](#phase-3--the-hands-act-with-approval-week-3)
- [Phase 4 – Memory, Safety and Shipping (Week 4)](#phase-4--memory-safety-and-shipping-week-4)
- [Cross-Cutting Concerns](#cross-cutting-concerns)
- [Testing Strategy](#testing-strategy)
- [Definition of Done](#definition-of-done)

---

## Phase 0 – Pre-Work and Setup

> **Duration:** Day 0 (before Week 1 begins)
> **Goal:** Workspace, tooling, and API keys ready before writing any extension code.

### Checklist

- [ ] Create GitHub repository `sahayak` (public)
- [ ] Create `.gitignore` — exclude `*.key`, `.env`, `config.local.js`, `node_modules/`
- [ ] Get Gemini API key from Google AI Studio (free tier)
- [ ] Get Groq API key from console.groq.com (free tier)
- [ ] Install Chrome (stable) and enable Developer Mode in `chrome://extensions`
- [ ] Set up folder structure as defined in `architecture.md section 3`
- [ ] Download and vendor `Readability.js` from Mozilla into `lib/Readability.js`
- [ ] Create `docs/` folder, place `problemStatement.md`, `architecture.md`, `implementation-plan.md`

### Folder Bootstrap

```
sahayak/
  manifest.json
  background/
  content/
  sidepanel/
    components/
    styles/
  settings/
  lib/
  assets/icons/
  docs/
  landing/
```

---

## Phase 1 – The Eyes: Read the Web (Week 1)

> **Objective:** Installable Chrome extension with a working side panel that can extract page content and produce structured AI summaries.

---

### Slice 1.1 — Extension Shell + Side Panel

**Goal:** Extension loads in Chrome. Side panel opens. No AI yet.

#### Files to Create

| File | Purpose |
|---|---|
| `manifest.json` | Full MV3 manifest |
| `background/service-worker.js` | Empty listener scaffold |
| `sidepanel/index.html` | Side panel HTML skeleton |
| `sidepanel/sidepanel.js` | Panel JS entry point |
| `sidepanel/styles/main.css` | Base styles |
| `assets/icons/*.png` | Extension icons (16, 48, 128) |

#### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Sahayak",
  "description": "Your AI browser assistant",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "storage", "contextMenus", "tabs", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background/service-worker.js" },
  "side_panel": { "default_path": "sidepanel/index.html" },
  "action": { "default_title": "Open Sahayak" },
  "options_page": "settings/settings.html"
}
```

#### service-worker.js scaffold

```js
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    default:
      return { success: false, error: `Unknown message type: ${msg.type}` };
  }
}
```

#### Test

- Load unpacked in `chrome://extensions`
- Click extension icon -> side panel opens
- No console errors

---

### Slice 1.2 — Settings Page + API Key Storage

**Goal:** User can enter and save Gemini API key securely.

#### Files to Create

| File | Purpose |
|---|---|
| `settings/settings.html` | Options page UI |
| `settings/settings.js` | Save/load from chrome.storage.local |
| `settings/settings.css` | Settings styles |
| `background/storage-manager.js` | Shared storage helpers |

#### storage-manager.js

```js
export async function getApiKey(provider = 'gemini') {
  const key = provider === 'gemini' ? 'geminiApiKey' : 'groqApiKey';
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

export async function setApiKey(provider, value) {
  const key = provider === 'gemini' ? 'geminiApiKey' : 'groqApiKey';
  await chrome.storage.local.set({ [key]: value });
}

export async function getLanguage() {
  const result = await chrome.storage.local.get('language');
  return result.language || 'en';
}

export async function setLanguage(lang) {
  await chrome.storage.local.set({ language: lang });
}
```

#### Test

- Open Options from `chrome://extensions`
- Enter a dummy API key, click Save
- Reopen Options -> key persists (shown masked)
- Verify key is NOT in any source file or git history

---

### Slice 1.3 — Readability.js Content Extraction

**Goal:** Content script extracts clean article text from any page.

#### Files to Create

| File | Purpose |
|---|---|
| `content/readability-wrapper.js` | Readability integration |
| `content/content-script.js` | Main injected script |
| `lib/Readability.js` | Vendored Mozilla Readability |

#### readability-wrapper.js

```js
function extractPageContent() {
  const docClone = document.cloneNode(true);
  const reader = new Readability(docClone);
  const article = reader.parse();

  if (article && article.textContent && article.textContent.length > 200) {
    return {
      type: 'article',
      title: article.title,
      text: article.textContent.trim().substring(0, 15000),
      url: location.href
    };
  }

  return {
    type: 'raw',
    title: document.title,
    text: document.body.innerText.trim().substring(0, 15000),
    url: location.href
  };
}
```

#### Test

- Navigate to any news article
- Run EXTRACT_CONTENT message from background DevTools
- Verify clean text returned without nav/footer noise

---

### Slice 1.4 — Gemini API Text Call

**Goal:** Service worker can call Gemini and return a text response.

#### model-router.js core

```js
import { getApiKey } from './storage-manager.js';

const MODELS = {
  'flash-lite': 'gemini-1.5-flash-8b',
  'flash': 'gemini-1.5-flash',
};

export async function callModel({ prompt, model = 'flash-lite', image = null }) {
  const apiKey = await getApiKey('gemini');
  if (!apiKey) throw new Error('Gemini API key not set. Please go to Settings.');

  const modelId = MODELS[model];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const parts = [{ text: prompt }];
  if (image) parts.push({ inlineData: { mimeType: 'image/png', data: image } });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
      continue;
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || 'Model API error');
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  return callGroqFallback(prompt);
}

async function callGroqFallback(prompt) {
  const apiKey = await getApiKey('groq');
  if (!apiKey) throw new Error('All AI providers are rate-limited. Please try again later.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'llama3-8b-8192', messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error('All AI providers are unavailable. Please try again later.');
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
```

---

### Slice 1.5 — Article Summarisation

**Goal:** User clicks Summarise, side panel shows structured summary.

#### buildSummaryPrompt()

```js
export function buildSummaryPrompt(text, lang = 'en') {
  const langInstruction = lang === 'hinglish'
    ? 'Respond in Hinglish — a natural mix of Hindi and English as spoken in everyday Indian conversation.'
    : 'Respond in clear, simple English.';

  return `You are Sahayak, a helpful browser assistant. ${langInstruction}

Summarise the following article. Structure your response EXACTLY as:

**TL;DR:** <one sentence>

**Key Points:**
1. ... 2. ... 3. ... 4. ... 5. ...

**What to do next:** <one actionable suggestion>

Article:
---
${text}`;
}
```

#### Test

- Open any BBC or Wikipedia article
- Click Summarise in side panel
- Verify TL;DR + 5 Key Points + What to do next appears

---

### Slice 1.6 — YouTube Summarisation

**Goal:** User pastes a public YouTube URL; summary with timestamps appears.

#### buildYouTubePrompt()

```js
export function buildYouTubePrompt(url, lang = 'en') {
  const langInstruction = lang === 'hinglish' ? 'Respond in Hinglish.' : 'Respond in English.';
  return `You are Sahayak. ${langInstruction}

The user is watching: ${url}

Provide:
1. **TL;DR:** one sentence
2. **Chapter Notes:** key topics with timestamps in [MM:SS] format
3. **Key Takeaways:** 3-5 bullet points`;
}
```

#### Timestamp rendering in Summary.js

```js
function linkifyTimestamps(text, youtubeUrl) {
  return text.replace(/\[(\d+):(\d+)\]/g, (match, m, s) => {
    const seconds = parseInt(m) * 60 + parseInt(s);
    return `<a href="${youtubeUrl}&t=${seconds}" target="_blank">[${m}:${s}]</a>`;
  });
}
```

#### Test

- Navigate to any public YouTube video
- Click Summarise -> chapters and clickable timestamps appear

---

### Slice 1.7 — Language Toggle (EN / Hinglish)

**Goal:** Toggle in header switches all output to Hinglish.

```js
async function toggleLanguage() {
  const current = await getLanguage();
  const next = current === 'en' ? 'hinglish' : 'en';
  await setLanguage(next);
  updateToggleUI(next);
  if (lastAction) rerunLastAction(next);
}
```

#### Test

- Summarise an article in English
- Click toggle -> re-run produces Hinglish output

---

### Phase 1 Acceptance Gate

- [ ] Extension loads in Chrome with no console errors
- [ ] Side panel opens on icon click
- [ ] API key saves in Settings and persists; never in source code
- [ ] Article summary: TL;DR + 5 Key Points + Next Step
- [ ] Public YouTube URL summary with timestamps
- [ ] Language toggle produces Hinglish output
- [ ] Selected text can be explained

---

## Phase 2 – The Brain: Understand Page and Screen (Week 2)

> **Objective:** Transform the side panel into a context-aware assistant that chats about the page and can see the screen.

---

### Slice 2.1 — Grounded Page Chat

**Goal:** User asks questions; answers come only from the current page.

#### buildChatPrompt()

```js
export function buildChatPrompt(pageText, history, query, lang = 'en') {
  const langInstruction = lang === 'hinglish' ? 'Respond in Hinglish.' : 'Respond in English.';
  const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'Sahayak'}: ${h.content}`).join('\n');

  return `You are Sahayak, a grounded page assistant. ${langInstruction}

RULES:
- Answer ONLY from the page content below.
- If the answer is not on the page, say EXACTLY: "This information is not available on the current page."
- Do not guess or add external information.

--- PAGE CONTENT ---
${pageText}
--- END ---

${historyText ? `Conversation:\n${historyText}\n` : ''}
User: ${query}
Sahayak:`;
}
```

#### Test

- Open a Wikipedia article
- Ask "What is the main topic?" -> correct answer from page
- Ask "What is the weather in Paris?" -> "not available on the current page"

---

### Slice 2.2 — Right-Click Context Menu Actions

**Goal:** Three right-click actions on selected text that open results in side panel.

#### context-menu.js

```js
export function registerContextMenus() {
  chrome.contextMenus.create({ id: 'explain', title: 'Sahayak: Explain this', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'translate', title: 'Sahayak: Translate', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'draft-reply', title: 'Sahayak: Draft a reply', contexts: ['selection'] });
}

export async function handleContextMenuClick(info, tab) {
  await chrome.sidePanel.open({ tabId: tab.id });
  chrome.runtime.sendMessage({ type: 'CONTEXT_ACTION', payload: { action: info.menuItemId, text: info.selectionText } });
}
```

#### Test

- Select text on any page
- Right-click -> "Sahayak: Explain this"
- Side panel opens and shows explanation
- Repeat for Translate and Draft a reply

---

### Slice 2.3 — Screenshot-and-Ask (Vision)

**Goal:** User captures the visible tab, optionally crops, asks a question.

#### Screenshot capture flow

```js
// service-worker.js
case 'CAPTURE_SCREENSHOT': {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const base64 = dataUrl.split(',')[1];
  return { success: true, data: { base64 } };
}

case 'SCREENSHOT_ASK': {
  const { base64, query, language } = msg.payload;
  const prompt = `You are Sahayak. Look at this screenshot and answer: ${query}`;
  const answer = await callModel({ prompt, model: 'flash', image: base64 });
  return { success: true, data: { answer } };
}
```

#### Crop UI (canvas-based in ScreenshotCapture.js)

```js
function cropImage(canvas, rect) {
  const cropped = document.createElement('canvas');
  cropped.width = rect.w;
  cropped.height = rect.h;
  cropped.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return cropped.toDataURL('image/png').split(',')[1];
}
```

#### Test

- Open a page with a chart or error message
- Click Screenshot-and-Ask
- Ask "What does this chart show?" -> accurate visual description

---

### Slice 2.4 — Free-Tier Resilience

**Goal:** Extension handles rate limits and API errors without crashing.

- [ ] HTTP 429 triggers exponential back-off (2s, 4s, 8s)
- [ ] After 3 Gemini failures, Groq fallback tried for text tasks
- [ ] If all fail -> human-readable error shown (not a blank screen)
- [ ] Error has a retry button
- [ ] No `console.error` without a corresponding UI update

#### Test

- Use a wrong API key -> trigger summarise
- Verify: friendly error message, no crash, retry works

---

### Phase 2 Acceptance Gate

- [ ] Page chat answers grounded in page content
- [ ] Out-of-page questions return the exact "not available" phrase
- [ ] Explain, Translate, Draft all work from right-click menu
- [ ] Results appear in the side panel
- [ ] Screenshot capture and crop work
- [ ] Visual question produces an answer via Gemini Flash
- [ ] HTTP 429 / API errors show friendly message, do not crash
- [ ] Groq fallback activates automatically for text tasks


---

## Phase 3 – The Hands: Act With Approval (Week 3)

> **Objective:** Add a controlled, human-in-the-loop agent that interacts with page elements only after explicit user approval.

---

### Slice 3.1 — Interactive Element Scanner + Badges

**Goal:** Content script scans DOM and returns a numbered element map with visual badges.

#### element-scanner.js

```js
const INTERACTIVE_SELECTORS = [
  'button:not([disabled])', 'a[href]',
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])', 'select:not([disabled])',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="combobox"]'
];

function scanInteractiveElements() {
  const elements = [];
  let id = 1;
  document.querySelectorAll(INTERACTIVE_SELECTORS.join(',')).forEach(el => {
    if (!isVisible(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    elements.push({
      id: id++,
      tag: el.tagName.toLowerCase(),
      type: el.type || el.getAttribute('role') || '',
      label: getLabel(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      selector: generateSelector(el)
    });
  });
  return elements;
}

function getLabel(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.innerText?.trim().substring(0, 60) ||
    el.getAttribute('name') ||
    el.tagName
  ).trim();
}
```

#### element-badges.js

```js
function renderBadges(elements) {
  clearBadges();
  elements.forEach(el => {
    const badge = document.createElement('span');
    badge.className = 'sahayak-badge';
    badge.textContent = el.id;
    badge.style.cssText = `
      position: fixed; top: ${el.rect.top - 10}px; left: ${el.rect.left - 10}px;
      background: #4F46E5; color: white; font-size: 11px; font-weight: bold;
      border-radius: 3px; padding: 1px 4px; z-index: 2147483647;
      pointer-events: none; font-family: monospace;
    `;
    document.body.appendChild(badge);
  });
}

function clearBadges() {
  document.querySelectorAll('.sahayak-badge').forEach(b => b.remove());
}
```

#### Compact Action Map Format

```js
function buildActionMapText(elements) {
  return elements.map(el =>
    `[${el.id}] ${el.tag}${el.type ? `(${el.type})` : ''}: "${el.label}"`
  ).join('\n');
}
// Output:
// [1] button: "Submit Application"
// [2] input(text): "Full Name"
// [3] input(email): "Email Address"
// [4] select: "Country"
```

#### Test

- Navigate to any form page
- Trigger SCAN_ELEMENTS from side panel
- Verify numbered badges appear over all interactive elements
- Verify action map text is compact and readable

---

### Slice 3.2 — Find It For Me (Element Selection)

**Goal:** User asks in plain language -> correct element highlighted (not clicked).

#### buildElementSelectPrompt()

```js
export function buildElementSelectPrompt(actionMapText, query) {
  return `You are Sahayak. The user wants to find a specific element.

Numbered action map:
${actionMapText}

User question: "${query}"

Return ONLY this JSON, no extra text:
{"element": <number>, "reason": "<one line why>"}

If no element matches: {"element": null, "reason": "No matching element found"}`;
}
```

#### Test

- Open a multi-field form
- Type: "Where do I enter my email?"
- Verify the email input field is highlighted with pulsing outline
- Verify no click or type action is executed

---

### Slice 3.3 — Agent Loop State Machine

**Goal:** Full one-step-at-a-time agent with Approve / Skip / Stop.

#### Agent state schema (chrome.storage.session)

```js
const DEFAULT_STATE = {
  task: '',
  stepIndex: 0,
  stepLimit: 20,
  status: 'idle', // idle|scanning|planning|awaiting_approval|executing|stopped|done
  pendingAction: null,
  actionLog: [],
  elementSnapshot: []
};
```

#### agent-loop.js — one iteration

```js
export async function runNextStep(tabId) {
  const state = await loadAgentState();
  if (state.status === 'stopped' || state.status === 'done') return;
  if (state.stepIndex >= state.stepLimit) {
    await updateAgentState({ status: 'done' });
    notifySidePanel({ type: 'AGENT_DONE', data: state });
    return;
  }

  // 1. Scan elements
  const elements = await scanElements(tabId);
  const mapText = buildActionMapText(elements);

  // 2. Plan
  const prompt = buildActionMapPrompt(mapText, state.task, state.actionLog);
  const raw = await callModel({ prompt });
  const action = validateAgentAction(raw); // throws on invalid JSON

  // 3. Safety check
  const safety = checkActionSafety(action, elements, tabId);
  if (!safety.allowed) {
    await updateAgentState({ status: 'stopped' });
    notifySidePanel({ type: 'AGENT_BLOCKED', reason: safety.reason });
    return;
  }

  // 4. Save state and wait for user
  await updateAgentState({ status: 'awaiting_approval', pendingAction: action, elementSnapshot: elements });
  notifySidePanel({ type: 'AWAITING_APPROVAL', step: state.stepIndex + 1, action, requiresExtraConfirm: safety.requiresExtraConfirm });
}
```

#### buildActionMapPrompt()

```js
export function buildActionMapPrompt(mapText, task, log) {
  const history = log.map(l => `Step ${l.step}: ${l.action} on [${l.element}] — ${l.decision}`).join('\n');
  return `You are Sahayak agent. Task: "${task}"

Elements:
${mapText}

${history ? `Completed steps:\n${history}\n` : ''}
Return ONLY this JSON:
{
  "action": "click | type | select | scroll | done",
  "element": <number or null>,
  "value": "<string or null>",
  "reason": "<one sentence>"
}`;
}
```

#### action-executor.js

```js
async function executeAction(action, elements) {
  const el = elements.find(e => e.id === action.element);
  const target = el ? document.querySelector(el.selector) : null;

  switch (action.action) {
    case 'click':
      target.click();
      break;
    case 'type':
      target.focus();
      target.value = action.value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    case 'select':
      target.value = action.value;
      target.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    case 'scroll':
      window.scrollBy(0, action.value === 'up' ? -500 : 500);
      break;
    case 'done':
      break;
  }
}
```

#### AgentApproval.js card display

```
Step 3 of 20
Action:  type  on  [2] Input: "Email Address"
Value:   ravi@example.com
Reason:  Fill in the email field as required by the form

[ Approve ]  [ Skip ]  [ Stop ]  [ Dry Run ]
```

#### AGENT_DECISION handler in service-worker.js

```js
case 'AGENT_DECISION': {
  const { decision } = msg.payload;
  const state = await loadAgentState();
  const logEntry = { step: state.stepIndex + 1, ...state.pendingAction, decision };

  if (decision === 'stop') {
    await updateAgentState({ status: 'stopped', actionLog: [...state.actionLog, logEntry] });
    return { success: true };
  }

  if (decision === 'approve') {
    await executeActionInTab(tabId, state.pendingAction, state.elementSnapshot);
  }
  // skip: do nothing, re-plan

  const newIndex = state.stepIndex + 1;
  const isDone = state.pendingAction.action === 'done' || newIndex >= state.stepLimit;
  await updateAgentState({ stepIndex: newIndex, actionLog: [...state.actionLog, logEntry], status: isDone ? 'done' : 'scanning' });

  if (isDone) {
    notifySidePanel({ type: 'AGENT_DONE', data: await loadAgentState() });
  } else {
    runNextStep(tabId);
  }
  return { success: true };
}
```

#### Test

- Open a practice contact form
- Give task: "Fill name field with 'Test User'"
- Verify approval card appears with correct action
- Click Approve -> field is filled
- Click Stop -> agent stops, log shows all steps

---

### Slice 3.4 — Agent Controls and Persistence

**Goal:** Step limit, dry run, and progress survive service worker sleep.

#### Persistence pattern

```js
async function updateAgentState(updates) {
  const current = await loadAgentState();
  const next = { ...current, ...updates };
  await chrome.storage.session.set({ agentState: next });
  return next;
}
```

#### Service worker wake-up recovery

```js
chrome.runtime.onStartup.addListener(async () => {
  const state = await loadAgentState();
  if (state.status === 'awaiting_approval') {
    notifySidePanel({ type: 'AWAITING_APPROVAL', step: state.stepIndex + 1, action: state.pendingAction });
  }
});
```

#### Dry run

```js
if (dryRun) {
  await highlightElement(tabId, pendingAction.element, elementSnapshot);
  logEntry.decision = 'dry-run';
} else {
  await executeActionInTab(tabId, pendingAction, elementSnapshot);
}
```

#### Test

- Start an agent task
- Close and reopen the side panel -> pending approval card reappears
- Test dry run: element highlighted, no click executed
- Test step limit: agent auto-stops at configured limit

---

### Phase 3 Acceptance Gate

- [ ] Interactive elements detected and numbered on supported pages
- [ ] "Find It For Me" highlights correct element from NL query
- [ ] Agent returns next action as strict JSON (no prose)
- [ ] No browser action executes without Approve click
- [ ] Approve, Skip, Stop, step limit, dry run all work
- [ ] Action log shows all proposed actions and user decisions
- [ ] Agent resumes after service worker sleep
- [ ] Agent completes at least 2 practice form-fill tasks with approval at every step


---

## Phase 4 – Memory, Safety and Shipping (Week 4)

> **Objective:** Make Sahayak personal, reusable, safe, and installable by any user.

---

### Slice 4.1 — Local Profile Memory

**Goal:** User profile stored only on the device; used in form fill and drafting.

#### Profile schema (chrome.storage.local)

```json
{
  "profile": {
    "name": "Ravi Kumar",
    "college": "IIT Patna",
    "skills": ["Python", "React", "ML"],
    "github": "github.com/ravi",
    "linkedin": "linkedin.com/in/ravi",
    "preferredLanguage": "hinglish",
    "preferredTone": "professional",
    "customFields": {}
  }
}
```

#### Profile use in form-fill agent

```js
// Inject into buildActionMapPrompt when profile is available
const profileContext = profile
  ? `\nUser profile for auto-fill:\n${JSON.stringify(profile, null, 2)}\n`
  : '';
```

#### Files to update

| File | Change |
|---|---|
| `settings/settings.html` | Add profile fields (name, college, skills, links, tone) |
| `background/storage-manager.js` | Add `getProfile()`, `saveProfile()` |
| `background/prompt-builder.js` | Inject profile into agent and draft prompts |

#### Test

- Enter profile in Settings
- Ask agent: "Fill this form using my profile"
- Verify name, college, skills are filled without the user typing

---

### Slice 4.2 — One-Click Skills

**Goal:** User can save, run, export, and import prompt recipes.

#### Skill schema

```json
{
  "id": "uuid",
  "name": "Explain in Hinglish",
  "icon": "emoji",
  "prompt": "Explain the content of this page in Hinglish for a first-year college student.",
  "scope": "page | selection | agent"
}
```

#### Built-in starter skills (seeded on first install)

| Name | Icon | Scope |
|---|---|---|
| Exam Notes | book | page |
| Explain in Hinglish | graduate | page |
| Reply Politely | envelope | selection |
| Fill from Profile | clipboard | agent |

#### Export / Import

```js
// Export
function exportSkills(skills) {
  const blob = new Blob([JSON.stringify(skills, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sahayak-skills.json';
  a.click();
}

// Import
async function importSkills(file) {
  const imported = JSON.parse(await file.text());
  const existing = await getSkills();
  const merged = deduplicateById([...existing, ...imported]);
  await saveSkills(merged);
  renderSkillsList(merged);
}
```

#### Test

- Create a custom skill "Summarise in 3 bullets"
- Run it on a page -> 3-bullet output
- Export to file, delete skill, re-import -> skill reappears

---

### Slice 4.3 — Safety Rails

**Goal:** Code-enforced safety that no AI model instruction can bypass.

#### safety.js — complete implementation

```js
const BLOCKED_DOMAIN_PATTERNS = [
  /netbanking/i, /onlinesbi\.com/i, /hdfcbank\.com/i, /icicibank\.com/i,
  /axisbank\.com/i, /kotak\.com/i, /paytm\.com/i, /phonepe\.com/i,
  /razorpay\.com/i, /stripe\.com/i, /paypal\.com/i, /checkout\./i, /payment\./i
];

const BLOCKED_INPUT_TYPES = ['password', 'tel'];
const BLOCKED_AUTOCOMPLETE = ['cc-number', 'cc-csc', 'cc-exp', 'new-password', 'current-password', 'one-time-code'];
const CONSEQUENTIAL_LABELS = ['submit', 'pay', 'send', 'confirm', 'purchase', 'book', 'delete', 'remove', 'proceed'];

export function isBlockedDomain(url) {
  return BLOCKED_DOMAIN_PATTERNS.some(p => p.test(url));
}

export function isBlockedField(element) {
  const type = (element.type || '').toLowerCase();
  const autocomplete = (element.autocomplete || '').toLowerCase();
  const name = (element.name || element.label || '').toLowerCase();
  if (BLOCKED_INPUT_TYPES.includes(type)) return { blocked: true, reason: `Cannot type into ${type} fields` };
  if (BLOCKED_AUTOCOMPLETE.some(a => autocomplete.includes(a))) return { blocked: true, reason: 'Cannot type into sensitive fields' };
  if (/otp|password|pin|cvv|cvc|card/.test(name)) return { blocked: true, reason: 'Cannot type into protected fields' };
  return { blocked: false };
}

export function isConsequentialAction(action, elements) {
  const el = elements.find(e => e.id === action.element);
  if (!el) return false;
  return CONSEQUENTIAL_LABELS.some(label => el.label.toLowerCase().includes(label));
}

export function checkActionSafety(action, elements, tabUrl) {
  if (isBlockedDomain(tabUrl)) {
    return { allowed: false, reason: 'Sahayak cannot act on banking or payment pages for your safety.' };
  }
  if (action.action === 'type' && action.element) {
    const el = elements.find(e => e.id === action.element);
    if (el) {
      const fieldCheck = isBlockedField(el);
      if (fieldCheck.blocked) return { allowed: false, reason: fieldCheck.reason };
    }
  }
  return { allowed: true, requiresExtraConfirm: isConsequentialAction(action, elements) };
}
```

#### Extra confirmation flow in AgentApproval.js

```js
// If requiresExtraConfirm is true, show warning before Approve button is active
if (action.requiresExtraConfirm) {
  showWarning('This is a consequential action (Submit / Pay / Send). Please confirm.');
  // User must click "Yes, I am sure" before Approve is enabled
}
```

#### .gitignore additions

```
config.local.js
*.key
.env
.env.local
sahayak-config.js
```

#### 8-Layer Safety Summary

| Layer | Mechanism | Implemented In |
|---|---|---|
| 1 | Domain blocklist | `safety.js` |
| 2 | Blocked field types | `safety.js`, `action-executor.js` |
| 3 | Consequential label second-confirm | `safety.js`, `AgentApproval.js` |
| 4 | Human approval gate for every step | `agent-loop.js` |
| 5 | Kill switch (Stop button) | `AgentApproval.js`, `agent-loop.js` |
| 6 | Dry run mode | `agent-loop.js`, `action-executor.js` |
| 7 | Step limit auto-stop | `agent-loop.js` |
| 8 | API key isolation | `.gitignore`, `storage-manager.js` |

#### Test

- Navigate to a banking URL (e.g., anything with "netbanking") -> agent blocked
- Try to type into a password field -> blocked
- Click "Submit" button -> extra confirmation required
- Click Stop at any point -> agent halts immediately
- Run `git log --all -- "**/*.key"` -> returns nothing

---

### Slice 4.4 — Public Packaging and Distribution

**Goal:** Any user can install Sahayak from GitHub in under 5 minutes.

#### README.md required sections

1. Project description + screenshot
2. Feature list with icons
3. Installation: 4-step "Load unpacked" guide
4. Settings: how to add API key
5. Usage guide for each major feature
6. Tech stack table
7. Development setup (for contributors)
8. License

#### GitHub Release checklist

- [ ] Tag: `v1.0.0`
- [ ] Zip the extension folder (exclude `.git`, `node_modules`, `docs/`)
- [ ] Attach ZIP as release asset named `sahayak-v1.0.0.zip`
- [ ] Write release notes listing all features
- [ ] Verify: download ZIP -> load unpacked -> full workflow works

#### GitHub Pages landing page (landing/index.html)

Required sections:
- Hero: "Your AI Browser Assistant — Read, Chat, See, Act"
- Feature cards (6): Summarise, Chat, Translate, Screenshot, Agent, Skills
- Installation steps (3-step visual guide)
- Screenshots of extension in action
- Download button linking to release ZIP
- GitHub repo link

#### Test

- Ask a second person (no prior knowledge) to install from release ZIP
- Verify they complete all 18 items in the Definition of Done

---

### Phase 4 Acceptance Gate

- [ ] Profile stored locally and used in form fill / drafting
- [ ] Custom skills can be created, run, exported, and imported
- [ ] 4 built-in starter skills work correctly
- [ ] Banking/payment pages blocked with friendly message
- [ ] Password, OTP, card fields cannot be typed into
- [ ] Consequential actions require second confirmation
- [ ] Kill switch immediately halts any running agent
- [ ] API key not in any committed file (verified with git log)
- [ ] Second user installs and runs from release ZIP successfully
- [ ] README has setup instructions and screenshots
- [ ] GitHub Pages landing page is live

---

## Cross-Cutting Concerns

### Naming Conventions

| Layer | Convention | Example |
|---|---|---|
| Message types | SCREAMING_SNAKE_CASE | `AGENT_START`, `CHAT_CHUNK` |
| JS functions | camelCase | `buildSummaryPrompt()` |
| CSS classes | kebab-case with prefix | `sahayak-badge`, `sahayak-card` |
| Storage keys | camelCase | `geminiApiKey`, `agentState` |
| Component files | PascalCase | `AgentApproval.js` |

### Token Budget Management

| Context | Max Characters Sent |
|---|---|
| Article page text | 15,000 (~3,750 tokens) |
| YouTube prompt | URL only |
| Chat page context | 12,000 (trim from middle) |
| Agent action map | 50 elements max (prune invisible) |
| Screenshot | 512x512 px crop recommended |

### Service Worker Lifecycle Rules

- Workers sleep after ~30 seconds of inactivity in MV3.
- Always save state BEFORE sending a message that needs a user response.
- On wake-up, restore UI from `chrome.storage.session`.
- Use `chrome.alarms` only if polling is ever required.

### Content Security Policy

- No inline scripts in manifest pages.
- No `eval()` anywhere.
- All scripts loaded from the extension bundle only.

---

## Testing Strategy

### Manual Test Pages (use for every phase)

| Test Type | Recommended Pages |
|---|---|
| Article summary | en.wikipedia.org, bbc.com/news |
| YouTube summary | Any public YouTube video |
| Page chat | Any Wikipedia article |
| Visual Q&A | Any page with a chart or form |
| Form fill agent | httpbin.org, any practice contact form |
| Element scanning | Any multi-field form page |
| Safety (blocked domain) | Any URL with "netbanking" or "payment" |

### After Every Slice

1. Reload unpacked extension in `chrome://extensions`
2. Open DevTools on the background service worker
3. Check for console errors
4. Run the slice-specific test
5. Run the regression checklist (below)

### Regression Checklist (run at end of each phase)

- [ ] Extension loads without errors
- [ ] Side panel opens on icon click
- [ ] Article summary works (BBC / Wikipedia)
- [ ] Language toggle produces Hinglish output
- [ ] Page chat answers from page content only
- [ ] Right-click Explain works
- [ ] Screenshot-and-Ask works
- [ ] Agent loop runs with approval gate
- [ ] Safety: banking page blocked
- [ ] Safety: password field blocked

---

## Definition of Done

Sahayak is complete when a **new user** (no prior knowledge of the code) can:

| # | Action | Expected Result |
|---|---|---|
| 1 | Install from release ZIP | Extension appears in Chrome |
| 2 | Enter Gemini API key in Settings | Key saved, no error |
| 3 | Open side panel on a news article | Panel opens next to page |
| 4 | Click Summarise | TL;DR + 5 Key Points + Next Step |
| 5 | Toggle language | Output switches to Hinglish |
| 6 | Ask question in Chat | Answer from page content |
| 7 | Ask out-of-page question | "Not available on current page" |
| 8 | Right-click selected text -> Explain | Explanation in panel |
| 9 | Take screenshot -> Ask question | Visual answer shown |
| 10 | Ask "Find the submit button" | Correct button highlighted |
| 11 | Give agent a form-fill task | Step-by-step approval flow starts |
| 12 | Click Approve on each step | Only approved actions execute |
| 13 | Click Stop mid-task | Agent halts immediately |
| 14 | Review action log | All steps and decisions visible |
| 15 | Navigate to banking site, try agent | Blocked with friendly message |
| 16 | Try typing into password field | Blocked |
| 17 | Run a saved skill | Skill executes on current page |
| 18 | Export skills, delete, import | Skills restored |

---

*Generated from `problemStatement.md` and `architecture.md` — Sahayak v1.0 Implementation Plan*
