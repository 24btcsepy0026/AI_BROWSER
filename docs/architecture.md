# Sahayak – Architecture Document

> **Chrome Side-Panel AI Browser Agent**
> Version 1.0 | Aligned with the 4-Week Build Plan

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Core Components](#4-core-components)
5. [AI & Model Layer](#5-ai--model-layer)
6. [Feature Modules](#6-feature-modules)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Chrome APIs Used](#8-chrome-apis-used)
9. [Storage Schema](#9-storage-schema)
10. [Message Passing Protocol](#10-message-passing-protocol)
11. [Safety Architecture](#11-safety-architecture)
12. [Model Strategy](#12-model-strategy)
13. [4-Week Build Roadmap](#13-4-week-build-roadmap)
14. [Non-Functional Considerations](#14-non-functional-considerations)
15. [Out of Scope](#15-out-of-scope)

---

## 1. Project Overview

**Sahayak** is a Chrome Extension (Manifest V3) that runs as a side-panel AI agent. It reads the currently active browser page, reasons about its content, and proposes browser actions that the user must explicitly approve before they are executed.

| Attribute | Value |
|---|---|
| Extension Type | Chrome MV3 Side Panel |
| Primary AI | Gemini Flash-Lite (default), Gemini Flash (fallback for complex tasks) |
| Text Fallback | Groq free tier |
| Local Storage | `chrome.storage.local` |
| Distribution | GitHub Release ZIP (Load unpacked) |
| Target | Desktop Chrome |

---

## 2. High-Level Architecture

```
+---------------------------------------------------------------------+
|                          CHROME BROWSER                             |
|                                                                     |
|  +------------------+        +---------------------------------+   |
|  |   Active Web Tab |        |         SIDE PANEL UI           |   |
|  |                  |<------>|  +---------------------------+  |   |
|  |  [Page Content]  |        |  |  Chat / Summary / Actions |  |   |
|  |  [DOM Elements]  |        |  |  Language Toggle          |  |   |
|  |  [Screenshot]    |        |  |  Agent Approval UI        |  |   |
|  +--------+---------+        |  |  Action Log               |  |   |
|           |                  |  |  Skills / Profile         |  |   |
|  +--------v---------+        |  +---------------------------+  |   |
|  |  CONTENT SCRIPT  |        +--------------+------------------+   |
|  |                  |                       |                       |
|  | - DOM scanner    |<----------------------+                       |
|  | - Element badges |   chrome.runtime.msg  |                       |
|  | - Readability.js |                       |                       |
|  | - Action executor|        +--------------v------------------+   |
|  +--------+---------+        |    BACKGROUND SERVICE WORKER    |   |
|           |                  |                                  |   |
|           +----------------->| - Message router                |   |
|    chrome.scripting /        | - Model router (AI gateway)     |   |
|    chrome.tabs.msg           | - Agent loop state machine      |   |
|                              | - Safety enforcement            |   |
|  +-------------------+       | - chrome.contextMenus manager   |   |
|  |  SETTINGS PAGE    |       | - chrome.storage manager        |   |
|  |  (extension page) |       +--------------+------------------+   |
|  |  - API key input  |                       |                       |
|  |  - Profile editor |                       |                       |
|  +-------------------+                       |                       |
|                                              | HTTPS fetch           |
+----------------------------------------------+---------------------+
                                               |
                          +--------------------v------------------+
                          |           EXTERNAL SERVICES           |
                          |                                       |
                          |  +-------------+  +---------------+  |
                          |  | Gemini API  |  |  Groq API     |  |
                          |  | Flash-Lite  |  |  (text only)  |  |
                          |  | Flash       |  |  fallback     |  |
                          |  +-------------+  +---------------+  |
                          +---------------------------------------+
```

---

## 3. Directory Structure

```
sahayak/
+-- manifest.json                    # MV3 manifest
+-- background/
|   +-- service-worker.js            # Main background entry point
|   +-- model-router.js              # AI model selection & API calls
|   +-- prompt-builder.js            # Constructs prompts per feature
|   +-- response-validator.js        # Validates/parses JSON from model
|   +-- agent-loop.js                # One-step-at-a-time agent state machine
|   +-- safety.js                    # Deterministic safety enforcement
|   +-- storage-manager.js           # chrome.storage read/write helpers
|   +-- context-menu.js              # Right-click menu registration & handler
|
+-- content/
|   +-- content-script.js            # Injected into active tab
|   +-- element-scanner.js           # DOM scanner for interactive elements
|   +-- element-badges.js            # Overlays numbered badges on DOM
|   +-- action-executor.js           # Executes approved browser actions
|   +-- readability-wrapper.js       # Mozilla Readability.js integration
|
+-- sidepanel/
|   +-- index.html                   # Side panel root HTML
|   +-- sidepanel.js                 # Side panel entry JS
|   +-- components/
|   |   +-- Chat.js                  # Chat interface component
|   |   +-- Summary.js               # Summary display component
|   |   +-- AgentApproval.js         # Approve / Skip / Stop UI
|   |   +-- ActionLog.js             # Scrollable action log
|   |   +-- SkillsPanel.js           # One-click skills list
|   |   +-- LanguageToggle.js        # EN / Hinglish toggle
|   |   +-- ScreenshotCapture.js     # Screenshot UI & crop tool
|   |   +-- QuickActions.js          # Explain / Translate / Draft buttons
|   +-- styles/
|       +-- main.css
|       +-- components.css
|
+-- settings/
|   +-- settings.html                # Extension settings page
|   +-- settings.js
|   +-- settings.css
|
+-- lib/
|   +-- Readability.js               # Mozilla Readability (vendored)
|   +-- utils.js                     # Shared utility functions
|
+-- assets/
|   +-- icons/                       # Extension icons (16, 48, 128px)
|   +-- screenshots/                 # Screenshots for README
|
+-- docs/
|   +-- problemStatement.md
|   +-- architecture.md              # <- this file
|
+-- landing/                         # GitHub Pages landing site
|   +-- index.html
|   +-- style.css
|
+-- .gitignore                       # Excludes keys, node_modules
+-- README.md
```

---

## 4. Core Components

### 4.1 Manifest & Extension Shell

**File:** `manifest.json`

Key permissions required:

```json
{
  "manifest_version": 3,
  "name": "Sahayak",
  "version": "1.0.0",
  "permissions": [
    "activeTab", "scripting", "storage", "contextMenus",
    "tabs", "sidePanel"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background/service-worker.js" },
  "side_panel": { "default_path": "sidepanel/index.html" },
  "action": { "default_title": "Open Sahayak" },
  "options_page": "settings/settings.html"
}
```

**Key MV3 Constraints:**
- Service worker is ephemeral; agent state must be persisted in `chrome.storage.session` or `chrome.storage.local`.
- Content scripts injected programmatically via `chrome.scripting.executeScript`.
- No persistent background pages; each wake-up starts fresh.

---

### 4.2 Background Service Worker

**File:** `background/service-worker.js`

The service worker is the **central message hub** and **AI gateway**.

| Responsibility | Delegated To |
|---|---|
| Route messages from side panel & content script | `service-worker.js` dispatcher |
| Call AI models (Gemini / Groq) | `model-router.js` |
| Build prompts per task | `prompt-builder.js` |
| Validate model JSON output | `response-validator.js` |
| Manage agent loop state | `agent-loop.js` |
| Block unsafe actions | `safety.js` |
| Read / write chrome.storage | `storage-manager.js` |
| Register & handle context menus | `context-menu.js` |

---

### 4.3 Side Panel UI

**File:** `sidepanel/index.html` + `sidepanel/sidepanel.js`

A single-page vanilla JS application inside Chrome's Side Panel.

**Views:**
1. **Home** – Quick actions (Summarise, Explain, Screenshot-ask)
2. **Chat** – Grounded page chat
3. **Agent** – Task input, approval flow, action log
4. **Skills** – Saved skill list, import/export
5. **Settings shortcut** – Link to settings page

---

### 4.4 Content Script

**File:** `content/content-script.js`

Injected dynamically into the active tab. Has direct DOM access.

**Responsibilities:**
- Extract page text via Readability.js wrapper
- Scan interactive elements via element-scanner
- Render numbered badges via element-badges
- Execute approved actions via action-executor
- Listen for messages from service worker

---

### 4.5 Settings Page

**File:** `settings/settings.html`

An `options_page` accessible via extension icon Options.

**Fields:**
- Gemini API Key (stored in `chrome.storage.local`, never committed)
- Groq API Key (optional fallback)
- Default language (English / Hinglish)
- User profile (name, college, skills, links, tone)

---

## 5. AI & Model Layer

### 5.1 Model Router

**File:** `background/model-router.js`

Determines which AI provider/model to use and handles retries.

**Model Selection Logic:**

| Task | Default Model | Upgrade / Fallback |
|---|---|---|
| Article summarisation | Gemini Flash-Lite | Groq (text) on quota |
| YouTube summarisation | Gemini Flash-Lite | – |
| Page chat | Gemini Flash-Lite | Groq (text) on quota |
| Screenshot-and-ask | Gemini Flash | No fallback (vision required) |
| Agent reasoning | Gemini Flash-Lite | Flash if JSON fails repeatedly |
| Element selection | Gemini Flash-Lite | Flash if JSON fails repeatedly |

**Rate-limit handling:**
1. Detect HTTP `429`.
2. Read `Retry-After` header if present.
3. Exponential back-off: 2s -> 4s -> 8s (max 3 retries).
4. Downgrade to Groq fallback for text tasks.
5. If all exhausted -> display user-friendly error state.

---

### 5.2 Prompt Builder

**File:** `background/prompt-builder.js`

| Builder Function | Input | Output |
|---|---|---|
| `buildSummaryPrompt(text, lang)` | Page text, language | Structured summary prompt |
| `buildYouTubePrompt(url, lang)` | YouTube URL, language | YouTube summary prompt |
| `buildChatPrompt(text, history, query)` | Page text, chat history, user query | Grounded chat prompt |
| `buildExplainPrompt(selection, lang)` | Selected text | Simplification prompt |
| `buildTranslatePrompt(selection, target)` | Selected text, target language | Translation prompt |
| `buildDraftPrompt(selection, lang)` | Selected text, tone | Reply draft prompt |
| `buildVisionPrompt(b64image, query)` | Base64 screenshot, user question | Vision Q&A prompt |
| `buildActionMapPrompt(map, task)` | Numbered element map, task | Agent next-step prompt |
| `buildElementSelectPrompt(map, query)` | Numbered element map, NL query | Element identification prompt |

**Hinglish Instruction Suffix:**
All responses must be in Hinglish — a natural mix of Hindi and English as spoken in everyday conversation.

---

### 5.3 Response Validator

**File:** `background/response-validator.js`

- **Text responses:** Trim and sanitise HTML.
- **JSON responses:** `JSON.parse` inside try/catch; validate schema.
- **Malformed JSON:** Retry with JSON repair instruction (max 2 retries).

Expected agent action schema:
```json
{
  "action": "click | type | select | scroll | done",
  "element": "<number or null>",
  "value": "<string or null>",
  "reason": "<one-line explanation>"
}
```

---

## 6. Feature Modules

### 6.1 Content Extraction (Week 1)

Uses Mozilla **Readability.js** to extract clean article text from DOM.

- **Article pages:** Full text extraction.
- **Non-article pages:** Fall back to `document.body.innerText` with a warning.
- **YouTube pages:** Skip Readability; use YouTube URL for model prompt.

### 6.2 Summarisation Engine (Week 1)

**Output Structure:**
```
TL;DR: <one sentence>

Key Points:
1. ...  2. ...  3. ...  4. ...  5. ...

What to do next: <actionable suggestion>
```

**YouTube Specific:**
- Send public YouTube URL to Gemini.
- Request chapter-style notes with timestamps.
- Render timestamps as clickable links.

### 6.3 Language Toggle (Week 1)

- Stored in `chrome.storage.local` as `{ language: "en" | "hinglish" }`.
- Toggle in side panel header.
- All prompt builders append Hinglish instruction suffix when set.
- Re-run last prompt when toggled.

### 6.4 Page Chat (Week 2)

- Page text extracted once per tab load and cached.
- Chat history maintained in memory (array of `{role, content}`).
- Grounded: model must admit when answer is not on the page.
- Supports streaming via Gemini streaming API.

### 6.5 Right-Click Context Actions (Week 2)

Three context menu items registered on `chrome.runtime.onInstalled`:
- **Sahayak: Explain this** – simplify jargon
- **Sahayak: Translate** – translate selection
- **Sahayak: Draft a reply** – draft reply to selected content

All results sent to and displayed in the side panel.

### 6.6 Screenshot-and-Ask (Week 2)

Flow:
```
User clicks Screenshot
  -> chrome.tabs.captureVisibleTab() -> Base64 PNG
  -> Optional crop UI (canvas) in side panel
  -> User types question
  -> buildVisionPrompt(b64, query)
  -> Gemini Flash (vision)
  -> Response displayed in side panel
```

### 6.7 Free-Tier Resilience (Week 2)

- HTTP 429 -> exponential back-off -> retry.
- Gemini quota -> switch to Groq (text tasks only).
- Parse errors -> retry with structured JSON instruction.
- All errors -> surface friendly message, never crash.

### 6.8 Interactive Element Scanner (Week 3)

Scans DOM for elements matching:
```js
button, a[href], input:not([type="hidden"]), textarea, select,
[role="button"], [role="link"], [role="checkbox"], [role="combobox"]
```

Each element gets a descriptor: `{ id, tag, type, label, rect, selector }`.

### 6.9 Numbered Action Map (Week 3)

Badge overlays rendered on interactive elements. Compact map sent to AI:
```
[1] Button: "Submit Application"
[2] Input: "Email address"
[3] Select: "Country"
[4] Link: "Privacy Policy"
```

**Find It For Me:** User asks in natural language -> model returns `{ element: N }` -> badge N pulsing highlight.

### 6.10 Agent Loop (Week 3)

**State Machine:**
```
IDLE -> SCANNING -> PLANNING -> AWAITING_APPROVAL -> EXECUTING -> SCANNING
                                       |
                                    STOPPED
```

**One Iteration:**
1. Scan page -> element map
2. Build action map prompt
3. Model returns strict JSON action
4. Validate JSON
5. Show AgentApproval card
6. User: Approve / Skip / Stop
7. If Approve -> execute action
8. Loop until `done` or step limit

Progress saved to `chrome.storage.session` after every step.

### 6.11 Agent Controls (Week 3)

| Control | Behaviour |
|---|---|
| **Approve** | Execute action, increment step counter |
| **Skip** | Skip action, re-prompt for alternative |
| **Stop** | Halt loop, remove badges, show log |
| **Step Limit** | Default 20; auto-stop on exceed |
| **Dry Run** | Highlight only, no execution |
| **Action Log** | Step #, action, reason, user decision |

### 6.12 Local Profile Memory (Week 4)

Profile schema in `chrome.storage.local`:
```json
{
  "profile": {
    "name": "string",
    "college": "string",
    "skills": ["string"],
    "links": { "github": "string", "linkedin": "string" },
    "preferredLanguage": "en | hinglish",
    "preferredTone": "formal | casual | friendly",
    "customFields": {}
  }
}
```

Used in: form fill agent, draft reply tone, personalised skills.

### 6.13 One-Click Skills (Week 4)

Skill schema:
```json
{
  "id": "uuid",
  "name": "Explain in Hinglish",
  "icon": "emoji",
  "prompt": "prompt template string",
  "scope": "page | selection | agent"
}
```

Built-in starters: Exam notes, Explain in Hinglish, Reply politely, Fill form from profile.

**Import/Export:** JSON file download/upload.

### 6.14 Safety Rails (Week 4)

Safety enforced in code, not dependent on model instructions.

**Blocked domains:** Banking and payment sites (SBI, HDFC, ICICI, Axis, Paytm, PhonePe, Razorpay, Stripe, PayPal, etc.)

**Blocked field types:** `password`, `otp`, fields with `autocomplete="cc-number"`, `new-password`, `one-time-code`.

**Consequential labels requiring second confirmation:** submit, pay, send, confirm, purchase, book, delete, remove.

---

## 7. Data Flow Diagrams

### 7.1 Summarisation Flow

```
User clicks "Summarise"
    |
    v
Side Panel -> chrome.runtime.sendMessage({ type: "SUMMARISE" })
    |
    v
Service Worker
  |- Inject content script into active tab
  |- Content script: Readability.js -> { title, text }
  |- Safety check: blocked domain? -> block if yes
  |- buildSummaryPrompt(text, language)
  |- modelRouter.call(prompt, model="gemini-flash-lite")
  |     -> On 429: retry / Groq fallback
  -> sendResponse({ summary: markdownText })
    |
    v
Side Panel renders Summary component
```

### 7.2 Page Chat Flow

```
User types question in Chat tab
    |
    v
Side Panel -> sendMessage({ type: "CHAT", query, history })
    |
    v
Service Worker
  |- Get page text from content script (cached if same tab)
  |- buildChatPrompt(pageText, history, query)
  |- modelRouter.streamCall(prompt) -> stream chunks
    |
    v (for each chunk)
chrome.runtime.sendMessage({ type: "CHAT_CHUNK", chunk })
    |
    v
Side Panel appends chunk to message bubble
```

### 7.3 Agent Loop Flow

```
User types task: "Fill the contact form with my profile"
    |
    v
Side Panel -> sendMessage({ type: "AGENT_START", task })
    |
    v
Agent Loop (service worker)
  |
  +-[Step N]-------------------------------------------+
  |  1. Scan interactive elements -> ActionMap          |
  |  2. buildActionMapPrompt(map, task, history)        |
  |  3. modelRouter.call -> strict JSON action          |
  |  4. response-validator validates JSON               |
  |  5. safety.js checks action                        |
  |     |- BLOCKED -> inform user, stop                 |
  |     -> OK -> continue                              |
  |  6. Save state to chrome.storage.session           |
  |  7. Send AWAITING_APPROVAL to side panel           |
  |  8. Side panel shows AgentApproval card            |
  |  9. User:                                          |
  |     |- APPROVE -> action-executor executes         |
  |     |- SKIP -> re-plan                             |
  |     -> STOP -> agent state = STOPPED              |
  | 10. If done or stepIndex >= stepLimit -> DONE      |
  +-[Step N+1]-----------------------------------------+
```

---

## 8. Chrome APIs Used

| API | Purpose |
|---|---|
| `chrome.sidePanel` | Register and open the side panel |
| `chrome.scripting.executeScript` | Inject content scripts dynamically |
| `chrome.tabs.captureVisibleTab` | Capture screenshot for visual Q&A |
| `chrome.tabs.sendMessage` | Communicate with content script |
| `chrome.runtime.sendMessage` | Side panel <-> service worker messaging |
| `chrome.runtime.onMessage` | Listen for messages in service worker |
| `chrome.contextMenus` | Register right-click actions |
| `chrome.storage.local` | Persistent profile, API keys, skills, preferences |
| `chrome.storage.session` | Agent loop state (cleared on browser restart) |
| `chrome.action.onClicked` | Open side panel on icon click |
| `chrome.tabs.onActivated` | Reset page context when tab changes |
| `chrome.tabs.onUpdated` | Detect page navigation within a tab |

---

## 9. Storage Schema

### chrome.storage.local

```json
{
  "geminiApiKey": "AIza...",
  "groqApiKey": "gsk_...",
  "language": "en",
  "defaultModel": "flash-lite",
  "profile": {
    "name": "Ravi Kumar",
    "college": "IIT Patna",
    "skills": ["Python", "React", "ML"],
    "links": { "github": "...", "linkedin": "..." },
    "preferredLanguage": "hinglish",
    "preferredTone": "formal",
    "customFields": {}
  },
  "skills": [
    {
      "id": "uuid-1",
      "name": "Explain in Hinglish",
      "icon": "emoji",
      "prompt": "...",
      "scope": "page"
    }
  ]
}
```

### chrome.storage.session

```json
{
  "agentState": {
    "task": "Fill the contact form",
    "stepIndex": 3,
    "stepLimit": 20,
    "status": "awaiting_approval",
    "pendingAction": { "action": "type", "element": 2, "value": "ravi@gmail.com", "reason": "Fill email" },
    "actionLog": [
      { "step": 1, "action": "click", "element": 1, "decision": "approved" },
      { "step": 2, "action": "type",  "element": 2, "decision": "skipped"  }
    ]
  },
  "pageCache": {
    "tabId": 42,
    "url": "https://example.com/form",
    "text": "..."
  }
}
```

---

## 10. Message Passing Protocol

All messages follow a standard envelope:

```js
// Request
{ type: MessageType, payload: object, tabId?: number }

// Response
{ success: boolean, data?: any, error?: string }
```

### Message Types

| `type` | Sender | Receiver | Payload |
|---|---|---|---|
| `SUMMARISE` | Side Panel | SW | `{ url, language }` |
| `SUMMARISE_YOUTUBE` | Side Panel | SW | `{ youtubeUrl, language }` |
| `CHAT` | Side Panel | SW | `{ query, history }` |
| `CHAT_CHUNK` | SW | Side Panel | `{ chunk }` |
| `EXPLAIN` | Side Panel / Menu | SW | `{ text, language }` |
| `TRANSLATE` | Side Panel / Menu | SW | `{ text, targetLang }` |
| `DRAFT_REPLY` | Side Panel / Menu | SW | `{ text, tone }` |
| `SCREENSHOT_ASK` | Side Panel | SW | `{ b64image, query }` |
| `SCAN_ELEMENTS` | SW | Content Script | `{}` |
| `ELEMENTS_RESULT` | Content Script | SW | `{ elements[] }` |
| `FIND_ELEMENT` | Side Panel | SW | `{ query }` |
| `HIGHLIGHT_ELEMENT` | SW | Content Script | `{ elementId }` |
| `AGENT_START` | Side Panel | SW | `{ task, stepLimit }` |
| `AWAITING_APPROVAL` | SW | Side Panel | `{ step, action, reason }` |
| `AGENT_DECISION` | Side Panel | SW | `{ decision }` |
| `EXECUTE_ACTION` | SW | Content Script | `{ action }` |
| `AGENT_DONE` | SW | Side Panel | `{ actionLog[] }` |
| `GET_PROFILE` | Side Panel | SW | `{}` |
| `SAVE_PROFILE` | Side Panel | SW | `{ profile }` |
| `GET_SKILLS` | Side Panel | SW | `{}` |
| `SAVE_SKILL` | Side Panel | SW | `{ skill }` |
| `DELETE_SKILL` | Side Panel | SW | `{ skillId }` |

---

## 11. Safety Architecture

Safety is a **multi-layer system** that cannot be overridden by the AI model.

```
Layer 1: Domain Blocklist (service worker)
   -> Blocks agent actions on banking/payment domains

Layer 2: Field Type Check (action executor)
   -> Refuses to type into password / OTP / card fields

Layer 3: Consequential Label Check (agent loop)
   -> Requires second confirmation for Submit/Pay/Send

Layer 4: Human Approval Gate (agent loop)
   -> Every action pauses for explicit user approval

Layer 5: Kill Switch (side panel UI)
   -> Visible Stop button always halts loop immediately

Layer 6: Dry Run Mode (agent loop)
   -> Highlight only, no execution

Layer 7: Step Limit (agent loop)
   -> Auto-stops after N steps (default 20)

Layer 8: API Key Isolation
   -> Keys in chrome.storage.local, excluded from git
```

---

## 12. Model Strategy

| Task Type | Model | Fallback |
|---|---|---|
| Text summarisation | Flash-Lite | Groq (text) |
| Page chat | Flash-Lite | Groq (text) |
| Explain / Translate | Flash-Lite | Groq (text) |
| Draft reply | Flash-Lite | Groq (text) |
| YouTube summarisation | Flash-Lite | – |
| Screenshot / Vision | Flash | – (no text fallback) |
| Agent reasoning (JSON) | Flash-Lite | Flash (if JSON fails) |
| Element selection (JSON) | Flash-Lite | Flash (if JSON fails) |

**Key Rule:** Gemini Flash is only invoked when the task requires vision, or Flash-Lite has failed to produce valid JSON after 2 retries.

---

## 13. 4-Week Build Roadmap

### Week 1 – The Eyes: Read the Web

| # | Task | File(s) |
|---|---|---|
| 1 | Extension shell + manifest | `manifest.json`, icons |
| 2 | Side panel scaffold | `sidepanel/index.html`, `sidepanel.js` |
| 3 | Settings page + API key storage | `settings/` |
| 4 | Gemini text call (ping) | `background/model-router.js` |
| 5 | Readability.js integration | `content/readability-wrapper.js` |
| 6 | Article summarisation | `prompt-builder.js`, `Summary.js` |
| 7 | YouTube summarisation | `prompt-builder.js` |
| 8 | Language toggle (EN/Hinglish) | `LanguageToggle.js`, storage |
| 9 | Selected-text explain | `QuickActions.js` |

**Acceptance:** Extension loads, side panel opens, article/YouTube summary works, language toggle works.

---

### Week 2 – The Brain: Understand Page and Screen

| # | Task | File(s) |
|---|---|---|
| 1 | Page chat UI | `Chat.js` |
| 2 | Grounded chat prompt + history | `prompt-builder.js` |
| 3 | Streaming responses | `model-router.js`, `Chat.js` |
| 4 | Context menu registration | `context-menu.js` |
| 5 | Explain / Translate / Draft handlers | `service-worker.js` |
| 6 | Screenshot capture | `ScreenshotCapture.js` |
| 7 | Screenshot crop UI (canvas) | `ScreenshotCapture.js` |
| 8 | Vision prompt + Gemini Flash | `prompt-builder.js`, `model-router.js` |
| 9 | Rate-limit handling + fallback | `model-router.js` |

**Acceptance:** Page chat, context menus, screenshot-ask work; 429 handled gracefully.

---

### Week 3 – The Hands: Act With Approval

| # | Task | File(s) |
|---|---|---|
| 1 | Element scanner | `content/element-scanner.js` |
| 2 | Badge overlay | `content/element-badges.js` |
| 3 | Action map prompt | `prompt-builder.js` |
| 4 | Find It For Me element select | `prompt-builder.js`, highlight |
| 5 | Agent loop state machine | `background/agent-loop.js` |
| 6 | AgentApproval UI | `sidepanel/components/AgentApproval.js` |
| 7 | Action executor | `content/action-executor.js` |
| 8 | Action log | `ActionLog.js` |
| 9 | Progress persistence (session storage) | `agent-loop.js` |
| 10 | Dry run, step limit, stop/skip | `agent-loop.js`, `AgentApproval.js` |

**Acceptance:** Agent loop runs with approval at every step; log preserved; dry run works.

---

### Week 4 – Memory, Safety, and Shipping

| # | Task | File(s) |
|---|---|---|
| 1 | Local profile editor | `settings/`, `storage-manager.js` |
| 2 | Profile usage in agent/drafts | `prompt-builder.js` |
| 3 | Skills CRUD | `SkillsPanel.js`, `storage-manager.js` |
| 4 | Skills import / export | `SkillsPanel.js` |
| 5 | Safety rails | `background/safety.js` |
| 6 | Consequential action second-confirm | `AgentApproval.js`, `agent-loop.js` |
| 7 | README + setup docs | `README.md` |
| 8 | `.gitignore` + key audit | `.gitignore` |
| 9 | Release ZIP packaging | GitHub Release |
| 10 | GitHub Pages landing page | `landing/` |

**Acceptance:** Profile, skills, safety rails all complete; extension installable by another user.

---

## 14. Non-Functional Considerations

### Reliability
- Validate all model JSON before executing any action.
- Persist agent state to `chrome.storage.session` so service-worker suspension does not lose progress.
- Exponential back-off for API rate limits.

### Performance
- Cache page text per tab URL in `chrome.storage.session`.
- Badge overlays use `position: absolute` with minimal repaints.
- Side panel uses vanilla JS; no heavy frameworks.

### Privacy
- API keys: `chrome.storage.local` only, excluded from git.
- Profile data: `chrome.storage.local` only, never transmitted without user action.
- Blocked-domain pages: page content is never sent to any external model.

### Accessibility
- Side panel UI uses semantic HTML and ARIA labels.
- Numbered badges have `aria-label` attributes.
- All interactive buttons have descriptive text.

### Security
- Content Security Policy in manifest restricts inline scripts.
- No `eval()` or dynamic script execution.
- Model JSON is validated and sandboxed before any DOM interaction.

---

## 15. Out of Scope

The following are explicitly **not** in scope for the 4-week build:

- Chrome for Android or iOS
- Autonomous execution without user approval
- Banking, payment, or UPI automation
- Login or OTP automation
- Entering passwords or card information
- Sending private/sensitive page content to free-tier models
- Chrome Web Store publication (GitHub Release + Load Unpacked is sufficient)

---

*Document generated from `problemStatement.md` — Sahayak v1.0 Architecture*
