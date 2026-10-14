# Sahayak - Edge Cases & Corner Scenarios

> All known corner cases, failure modes, and boundary conditions for every feature.
> Reference during implementation AND QA before each phase acceptance gate.

---

## Table of Contents

1. [Extension Shell & Lifecycle](#1-extension-shell--lifecycle)
2. [Settings & API Key Storage](#2-settings--api-key-storage)
3. [Content Extraction (Readability)](#3-content-extraction-readability)
4. [Article Summarisation](#4-article-summarisation)
5. [YouTube Summarisation](#5-youtube-summarisation)
6. [Language Toggle](#6-language-toggle)
7. [Gemini API & Model Router](#7-gemini-api--model-router)
8. [Groq Fallback](#8-groq-fallback)
9. [Page Chat (Grounded)](#9-page-chat-grounded)
10. [Right-Click Context Actions](#10-right-click-context-actions)
11. [Screenshot-and-Ask (Vision)](#11-screenshot-and-ask-vision)
12. [Interactive Element Scanner](#12-interactive-element-scanner)
13. [Numbered Action Map](#13-numbered-action-map)
14. [Find It For Me (Element Selection)](#14-find-it-for-me-element-selection)
15. [Agent Loop State Machine](#15-agent-loop-state-machine)
16. [Action Executor](#16-action-executor)
17. [Agent Controls (Approve / Skip / Stop)](#17-agent-controls-approve--skip--stop)
18. [Agent Persistence (Service Worker Sleep)](#18-agent-persistence-service-worker-sleep)
19. [Local Profile Memory](#19-local-profile-memory)
20. [One-Click Skills](#20-one-click-skills)
21. [Safety Rails](#21-safety-rails)
22. [Message Passing Protocol](#22-message-passing-protocol)
23. [Chrome Storage](#23-chrome-storage)
24. [Side Panel UI](#24-side-panel-ui)
25. [Cross-Tab and Navigation Scenarios](#25-cross-tab-and-navigation-scenarios)
26. [Quick Reference: Priority Matrix](#26-quick-reference-priority-matrix)

---

## 1. Extension Shell & Lifecycle

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 1.1 | User reloads extension from `chrome://extensions` while side panel is open | Panel goes blank | Detect disconnect; show "Extension reloaded. Please reopen the panel." |
| 1.2 | Chrome updates and kills service worker mid-task | Agent state lost | Restore from `chrome.storage.session` on next wake |
| 1.3 | Side panel opened on `chrome://settings` or `chrome://extensions` | `activeTab` permission denied | Show: "Sahayak cannot run on Chrome internal pages." |
| 1.4 | Side panel opened on a `file://` URL | Script injection blocked | Warn: "Enable 'Allow access to file URLs' in extension settings." |
| 1.5 | Extension installed but side panel never opened | No crash expected | Silent; service worker only registers context menus |
| 1.6 | Two Chrome windows open; user switches between them | Panel associated with wrong tab | Always query `currentWindow: true` when resolving active tab |
| 1.7 | Service worker wakes with no active tabs | `chrome.tabs.query` returns empty | Guard with null check; show "No active tab found." |
| 1.8 | Extension loaded from a path with spaces or Unicode | Module import failure | Test load from a spaced path before release |
| 1.9 | Manifest updated while extension running (dev reload) | Old worker still handling messages | Force-reload side panel on `chrome.runtime.onInstalled` |

---

## 2. Settings & API Key Storage

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 2.1 | User submits empty API key | Silent failure on AI call | Validate on save: "API key cannot be empty." |
| 2.2 | API key pasted with leading/trailing whitespace | API call fails (400) | Trim whitespace before storing |
| 2.3 | Groq key entered in Gemini field (wrong format) | 401 / 403 from Gemini | Warn if key does not match `AIza...` pattern |
| 2.4 | User clears API key after extension has been running | Next call fails silently | Check for null key before every model call |
| 2.5 | `chrome.storage.local` quota exceeded (~10 MB) | Write fails silently | Catch storage errors; warn user to export/delete old skills |
| 2.6 | API key variable accidentally logged to console | Key visible in DevTools | Audit all `console.log` calls; never log `apiKey` |

---

## 3. Content Extraction (Readability)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 3.1 | Page is a SPA; content loads after DOM ready | Readability runs before content renders | Add 500ms delay; if text <200 chars, warn "Content may be incomplete." |
| 3.2 | Page is a login wall / paywall | Only login form text extracted | Detect low text length; show "Limited readable content found." |
| 3.3 | Page is a PDF in Chrome's PDF viewer | `document.body.innerText` empty | Detect `.pdf` URL or content-type; show "PDF summarisation is not supported." |
| 3.4 | Page has enormous text (legal docs, Wikipedia categories) | Exceeds token budget | Truncate at 15,000 chars; show "Content trimmed to fit AI context limit." |
| 3.5 | Page has no meaningful text (image gallery, canvas game) | Empty extraction | Show "No readable content found. Try Screenshot-and-Ask." |
| 3.6 | Readability.js throws on a malformed DOM | Content script crashes | Wrap in try/catch; fall back to `document.body.innerText` |
| 3.7 | Page content changes dynamically (live scores, chat) | Stale cached text used | Invalidate cache on `chrome.tabs.onUpdated` URL change |
| 3.8 | Needed content is inside an iFrame | iFrame DOM inaccessible | Document as limitation; extract top-level document only |
| 3.9 | Page text is entirely in a non-Latin script | Tokenisation issues | Pass as-is; model handles multilingual content |

---

## 4. Article Summarisation

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 4.1 | Summarise clicked before page fully loads | Incomplete text sent | Show spinner; inject content script only after `readyState === 'complete'` |
| 4.2 | Summarise on a non-article page (home page, search results) | Gibberish summary | Detect low content quality; suggest "Try Screenshot-and-Ask instead." |
| 4.3 | Article text is in Hindi but output language is English | Model may respond in Hindi | Prompt must say: "Respond in English regardless of the source language." |
| 4.4 | Model returns fewer than 5 key points | Display breaks | Parse output; show what was returned without crashing |
| 4.5 | Summarise button clicked multiple times rapidly | Multiple API calls fire | Debounce; disable button while request is in-flight |
| 4.6 | Article is extremely short (<200 words) | Summary longer than original | Still summarise; model produces naturally shorter output |
| 4.7 | Page title is empty or generic ("Untitled") | Poor display header | Fall back to domain name as title |

---

## 5. YouTube Summarisation

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 5.1 | URL is private or unlisted | Model cannot access | Surface Gemini message: "Cannot access this video." |
| 5.2 | URL is a YouTube Shorts link (`/shorts/`) | Different URL format | Detect `/shorts/`; treat same as regular video |
| 5.3 | URL is a playlist without a specific video (`list=` only) | Ambiguous content | Ask user: "Please select a specific video from the playlist." |
| 5.4 | Gemini cannot generate timestamps | Empty chapter section | Gracefully omit chapter notes; show TL;DR and takeaways only |
| 5.5 | YouTube opened in a non-English browser language | Chapter notes in wrong language | Instruct model to output in user's preferred language |
| 5.6 | YouTube URL pasted in chat instead of Summarise box | Chat prompt used instead of YouTube prompt | Detect YouTube URL in chat; route to `buildYouTubePrompt()` |

---

## 6. Language Toggle

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 6.1 | Toggle clicked while a request is in-flight | Response returns in old language | Cancel or ignore in-flight result; re-run with new language |
| 6.2 | Toggle clicked with no content shown | Re-run fails silently | If no `lastAction`, only update toggle UI |
| 6.3 | Hinglish output is entirely in Hindi (not mixed) | Not true Hinglish | Refine prompt: "Mix English and Hindi naturally; avoid full Hindi sentences." |
| 6.4 | Hinglish output translates proper nouns | Confusing result | Prompt must say: "Do not translate proper nouns, brand names, or technical terms." |
| 6.5 | Language preference lost after browser restart | Reverts to English | Stored in `chrome.storage.local`; survives restarts |
| 6.6 | Profile `preferredLanguage` conflicts with toggle state | Inconsistent output | Toggle state takes precedence over profile preference |

---

## 7. Gemini API & Model Router

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 7.1 | HTTP 429 on first request | Immediate failure | Back-off: 2s, 4s, 8s; then try Groq fallback |
| 7.2 | HTTP 500 / 503 from Gemini | Retry loop forever | Max 3 retries for 5xx; show "AI service temporarily unavailable." |
| 7.3 | Network offline | `fetch` throws TypeError | Show "No internet connection. Please check your network." |
| 7.4 | Gemini API key revoked or quota exhausted | 403 response | Show "API key invalid or quota exceeded. Check Settings." |
| 7.5 | Model response is empty or whitespace only | Silent blank display | Show "The AI returned an empty response. Please try again." |
| 7.6 | API call takes >30 seconds | Service worker sleeps | Set `AbortController` timeout at 25s; show "Request timed out." |
| 7.7 | User switches tab during API call | Result returned for wrong tab | Tag each request with `tabId`; discard if tab changed |
| 7.8 | Response contains markdown that breaks HTML renderer | Rendering error | Sanitise markdown before rendering; escape dangerous HTML |
| 7.9 | Vision task attempted but Gemini Flash-Lite selected | Wrong model for image | Always route image tasks to Gemini Flash, not Flash-Lite |

---

## 8. Groq Fallback

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 8.1 | Groq key not set but Gemini rate-limited | Double failure | Show: "Gemini rate limited and no Groq key set. Add a Groq key or wait." |
| 8.2 | Groq also rate-limited | Both providers unavailable | Show: "All AI providers are unavailable. Try again in a few minutes." |
| 8.3 | Vision task attempted when Gemini is rate-limited | Groq cannot handle images | Show: "Screenshot questions require Gemini (vision). Try later." |
| 8.4 | Groq response format differs from Gemini | Parsing inconsistency | Always read `.choices[0].message.content` for Groq; keep extraction normalised |
| 8.5 | Groq model deprecated | 404 from Groq | Store model name in a single config constant; easy to update |

---

## 9. Page Chat (Grounded)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 9.1 | Question asked before page text extracted | Null context sent to model | Extract and cache on panel open; show loading indicator |
| 9.2 | Chat history grows very large (>50 messages) | Context window exceeded | Keep last 10 exchanges; trim older messages |
| 9.3 | Model hallucinates an answer not on the page | Trust violation | Strong grounding instruction in prompt; disclaimer shown in UI |
| 9.4 | User asks in Hindi but page is English | Language mismatch | Instruct model: "Respond in the same language as the user's question." |
| 9.5 | User sends empty chat message | Empty API call | Disable Send if input is empty or whitespace-only |
| 9.6 | User sends a very long message (>2000 chars) | Token budget blown | Truncate user message at 1000 chars; warn user |
| 9.7 | Streaming response interrupted mid-sentence | Broken partial text | Append "[Response interrupted. Please retry.]" on stream error |
| 9.8 | User navigates to new page mid-conversation | Old page context used for new page | Detect `chrome.tabs.onUpdated`; reset chat; notify user |
| 9.9 | User asks the same question twice rapidly | Duplicate API calls | Debounce send; disable while response in-flight |

---

## 10. Right-Click Context Actions

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 10.1 | Right-click with no text selected | Empty `selectionText` | Disable context menu items or show "Please select text first." |
| 10.2 | Context menu clicked but side panel fails to open | Result computed; nowhere shown | Open panel; wait for confirmation before sending result |
| 10.3 | Selected text contains HTML tags or script snippets | XSS risk | Sanitise selection text before inserting into prompt or HTML |
| 10.4 | User selects text inside an iFrame | `selectionText` may be empty | Document limitation; show "Text selection in embedded frames is not supported." |
| 10.5 | "Translate" clicked with no target language configured | Ambiguous | Default to Hindi; allow target language config in Settings |
| 10.6 | "Draft a reply" on a code snippet | Nonsensical draft | Instruct model: "If content is not a text to reply to, explain why." |
| 10.7 | Multiple context menu items clicked rapidly | Duplicate queued actions | Track in-flight action; ignore new clicks until first completes |

---

## 11. Screenshot-and-Ask (Vision)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 11.1 | `captureVisibleTab` fails (permission denied) | Error thrown | Show "Screenshot permission denied. Ensure activeTab access is granted." |
| 11.2 | Screenshot of a very long page | Only viewport captured | Document: "Captures visible area only. Scroll to relevant section first." |
| 11.3 | Crop region dragged to zero size | Empty base64 image | Validate crop dims > 0 before sending; show "Please drag to select an area." |
| 11.4 | User submits screenshot with empty question | Empty prompt | Disable Ask button if question field is empty |
| 11.5 | Screenshot contains PII | PII sent to external API | Warn before sending: "This screenshot will be sent to Google Gemini. Check for sensitive info." |
| 11.6 | Page uses GPU-accelerated canvas (WebGL game) | `captureVisibleTab` returns blank | Document limitation; show "Some GPU-rendered pages may not capture correctly." |
| 11.7 | Screenshot on 4K display is very large | Huge base64; slow or rejected | Resize to max 1280px width before encoding; maintain aspect ratio |
| 11.8 | `captureVisibleTab` on incognito tab | May require extra permission | Check `tab.incognito`; show "Screenshot not available in Incognito." |

---

## 12. Interactive Element Scanner

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 12.1 | Page has thousands of interactive elements (data tables) | Action map too large for AI | Limit to top 50 visible elements; prioritise elements in current viewport |
| 12.2 | Dynamic elements added after scan (autocomplete dropdown) | Element not in action map | Rescan before each agent step; never cache element map between steps |
| 12.3 | Element is inside a Shadow DOM | `querySelector` cannot reach it | Document as known limitation; skip shadow DOM elements |
| 12.4 | Element moves after scroll (sticky headers) | Badge position becomes stale | Badges use `position: fixed`; re-render on scroll |
| 12.5 | Element's selector changes after React re-render | `querySelector` returns null | Prefer `id` attribute; always null-check before acting |
| 12.6 | Two elements have identical labels | Model picks wrong one | Include `rect` position in disambiguation |
| 12.7 | Element is disabled mid-task (form validation) | `click()` does nothing silently | Check `el.disabled` before executing; report "Element [N] is now disabled." |
| 12.8 | Page uses virtual scrolling | Rows absent from DOM | Advise user to scroll list to make elements visible before scanning |
| 12.9 | Scanner runs on a Chrome internal page | `executeScript` throws | Block scanner on `chrome://` and `chrome-extension://` URLs |
| 12.10 | Elements have zero opacity | Included in map but invisible to user | Filter elements where `opacity === 0` or `visibility === hidden` |


---

## 13. Numbered Action Map

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 13.1 | Action map text exceeds AI context limit | Map truncated arbitrarily | Hard cap at 50 elements; prioritise viewport elements |
| 13.2 | Element labels contain double quotes | JSON parse error in model response | Escape quotes in label text before building the map |
| 13.3 | Element label is empty (icon-only button) | `""` sent to model | Fall back chain: `title` -> `aria-label` -> `tag+type` |
| 13.4 | Element IDs are not stable across re-scans | Model references stale ID | Always rescan and rebuild map before each agent step; never cache IDs |
| 13.5 | Badge overlays shift layout or obscure content | User cannot read page | Badges use `pointer-events: none` and `position: fixed`; do not affect layout flow |

---

## 14. Find It For Me (Element Selection)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 14.1 | Model returns `null` for element | No visual feedback | Show "Sahayak could not find a matching element. Try rephrasing." |
| 14.2 | Model returns element ID outside current map range | `querySelector` fails | Validate ID is within bounds before highlighting |
| 14.3 | Model returns prose instead of JSON | Parse error | Retry once with explicit JSON-only instruction; show fallback error |
| 14.4 | Target element is off-screen | Highlight not visible | Use `scrollIntoView({ behavior: 'smooth' })` before highlighting |
| 14.5 | Multiple elements match the query | Model picks first arbitrarily | Instruct model: "Choose the most contextually relevant element." |
| 14.6 | Find It triggered right after page navigation | Stale element map used | Always rescan on every Find It request |

---

## 15. Agent Loop State Machine

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 15.1 | Model returns `"action": "done"` on step 1 | Task completed too early | Re-prompt: "Are you sure the task is complete? List what was accomplished." |
| 15.2 | Model repeats the same action 3+ times | Infinite loop until step limit | Detect identical consecutive actions; break loop and notify user |
| 15.3 | User navigates to a different page mid-task | Elements on new page; old context | Detect via `chrome.tabs.onUpdated`; pause agent; ask user to continue or stop |
| 15.4 | Agent reaches a login wall | Login form detected; password field blocked | Agent reports "Cannot proceed: login required and password fields are blocked." |
| 15.5 | Step limit reached before task completion | Partial completion | Show final log and message: "Step limit reached. Task may be incomplete." |
| 15.6 | Task description is ambiguous ("do the thing") | Model proposes random actions | Instruct model: "If task is unclear, return action: done with clarification reason." |
| 15.7 | Model JSON has correct keys but wrong value types | Executor fails | Validate: `element` must be a number, `action` must be in allowed enum |
| 15.8 | Two agent tasks started simultaneously | State machine race condition | Block starting new task if `status !== idle`; disable Start button |
| 15.9 | User closes Chrome mid-task | Session storage cleared | `chrome.storage.session` cleared on restart; agent resets to idle |
| 15.10 | `scroll` action does nothing (already at bottom) | Loop stalls | Detect unchanged DOM after scroll; advance to next step |

---

## 16. Action Executor

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 16.1 | `click()` on a link opens a new tab | Agent context lost | Detect via `chrome.tabs.onCreated`; pause agent; ask "New tab opened. Continue there?" |
| 16.2 | `type` on a field with `maxlength` | Text silently truncated | Check `maxlength` before typing; warn if value would be truncated |
| 16.3 | `type` on a React-controlled input | `dispatchEvent` does not update state | Fire both `input` and `change` events; try `nativeInputValueSetter` hack for React |
| 16.4 | `select` value not in `<select>` options | Value unchanged silently | Validate value exists in `select.options`; report mismatch |
| 16.5 | `click` on `<button type="submit">` | Form submits immediately | Safety check: if button is consequential, require extra confirmation first |
| 16.6 | Target element is inside an iFrame | `querySelector` from top-level fails | Report: "Element [N] is inside a frame and cannot be reached." |
| 16.7 | Action executor throws uncaught exception | Content script crashes | Wrap all calls in try/catch; report error to agent loop; mark step as failed |
| 16.8 | `type` action replaces an existing value | User pre-filled data overwritten | Show in approval: "This will replace the current value: [current content]" |
| 16.9 | Execution succeeds but page update is delayed (AJAX) | Next scan sees old DOM | Wait 800ms after each action before rescanning |
| 16.10 | `click` on a checkbox that toggles to wrong state | Unexpected state | Check `el.checked` before clicking; include current state in action description |

---

## 17. Agent Controls (Approve / Skip / Stop)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 17.1 | Approve clicked multiple times before disabled | Action executed multiple times | Disable all decision buttons immediately on first click |
| 17.2 | User skips every step | Task never progresses | After 5 consecutive skips, prompt: "Cannot complete without approvals. Stop?" |
| 17.3 | Stop clicked; new task started immediately | State not fully reset | Ensure `status = idle` and `pendingAction = null` before allowing new task |
| 17.4 | Dry run enabled but user clicks Approve | Dry run flag bypassed | Approve always executes; dry run is a preview-only toggle |
| 17.5 | Consequential confirm dialog dismissed (ESC key) | Action proceeds without confirm | Treat ESC as Cancel; keep action in awaiting_approval state |
| 17.6 | User AFK during approval (>10 minutes) | Worker sleeps | State preserved in session storage; approval card re-shown on return |
| 17.7 | Action log has >100 entries | Slow rendering; memory pressure | Cap display at last 50 entries with a "Show all" option |

---

## 18. Agent Persistence (Service Worker Sleep)

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 18.1 | Service worker sleeps between agent steps | Loop state lost | Save to `chrome.storage.session` before every `notifySidePanel` call |
| 18.2 | Side panel sends `AGENT_DECISION` while worker asleep | Message lost | Worker wakes on any message; side panel retries with exponential back-off |
| 18.3 | Worker wakes; session storage is empty | Cannot restore state | Guard with default state; reset to idle gracefully |
| 18.4 | Multiple wake-ups call `runNextStep` concurrently | Duplicate actions | Use an `isRunning` boolean in session storage as a mutex |
| 18.5 | `chrome.tabs.onUpdated` fires while worker processes a step | Race between navigation and execution | Check tab URL at start of each step; abort if URL changed |

---

## 19. Local Profile Memory

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 19.1 | Profile fields contain special characters (quotes, backslash) | JSON serialisation error | Use `JSON.stringify` for storage; parse with `JSON.parse` always |
| 19.2 | All profile fields left blank | Empty object injected into prompt | Only inject non-empty fields into prompt context |
| 19.3 | Very long skills list (100+ items) | Token budget blown | Truncate to 10 skills in prompt context |
| 19.4 | `preferredTone` is an unexpected value | Prompt instruction breaks | Validate on save; only accept: formal, casual, friendly |
| 19.5 | Agent fills a form with profile data on an unintended page | PII on wrong site | User sees and approves each action; safety domain check also applies |
| 19.6 | Skill export accidentally includes profile data | PII in export file | Profile stored in separate key from skills; skill export never reads profile |

---

## 20. One-Click Skills

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 20.1 | Imported skills JSON is malformed | `JSON.parse` throws | Wrap import in try/catch; show "Invalid skills file. Please check the format." |
| 20.2 | Imported skills file is very large (user error) | Memory spike on parse | Reject files over 512KB with error message |
| 20.3 | Two skills have same `id` | Deduplication drops one | Use `id` as unique key; last-imported wins; warn user |
| 20.4 | Skill prompt references `{{profile.name}}` but profile is empty | Literal template string in output | Substitute empty string for missing fields before running |
| 20.5 | User deletes a built-in starter skill | Gone permanently | Re-seed built-in skills on `onInstalled`; or add "Restore defaults" button |
| 20.6 | Skill with `scope: agent` on page with no interactive elements | Agent finds nothing | Show "No interactive elements found on this page." |
| 20.7 | Skill with `scope: selection` run with no text selected | Empty prompt | Show "Please select some text before running this skill." |
| 20.8 | Skill button clicked multiple times rapidly | Multiple executions queued | Disable skill button while execution is in-flight |

---

## 21. Safety Rails

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 21.1 | Banking domain check substring-matches a safe page | False positive; page blocked | Check hostname only, not path or content |
| 21.2 | User visits "how to do online banking" article | Incorrectly blocked | Use word-boundary regex on hostname; article URLs are not blocked |
| 21.3 | Password field renamed to `user_secret` to bypass check | Field check missed | Check `type="password"` AND `autocomplete` AND name patterns: `secret`, `pass`, `pin`, `otp` |
| 21.4 | Safety check uses task-start URL but domain changed mid-loop | Wrong domain checked | Always fetch current tab URL at safety check time |
| 21.5 | Consequential button has custom label ("Proceed to checkout") | Extra confirm skipped | Add: `proceed`, `checkout`, `place order`, `confirm booking`, `continue` to consequential list |
| 21.6 | User previews blocked action in dry run then approves it | Safety bypass via dry run | Safety check runs at approval time; blocked actions cannot be approved regardless |
| 21.7 | API key accidentally committed to git | Key publicly exposed | Pre-commit hook: check staged `.js` / `.json` files for `AIza` pattern |
| 21.8 | Model generates a `type` action with a card number as value | Card data typed into non-blocked field | Pattern-check `value` field: if matches `\d{13,16}`, block regardless of field type |
| 21.9 | Stop clicked but `executeActionInTab` already called | Action executes before stop | Check stop flag before and immediately after `executeScript` call |

---

## 22. Message Passing Protocol

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 22.1 | `sendMessage` called when side panel is closed | "Receiving end does not exist" error | Wrap all `sendMessage` in try/catch; suppress known disconnect errors |
| 22.2 | Message response never arrives (worker crashed mid-handler) | Side panel hangs indefinitely | Client-side 30s timeout; show "Request timed out." |
| 22.3 | Content script not injected when message sent to tab | Message lost silently | Always `executeScript` before `tabs.sendMessage` |
| 22.4 | Same message type handled by both service worker and content script | Double execution | Namespace clearly: use `sender.tab` presence to differentiate |
| 22.5 | Message payload is very large (screenshot + page text) | Serialisation slow; Chrome limit | Compress or truncate; base64 image max 4MB before sending |
| 22.6 | Side panel sends message before service worker has loaded | Message dropped | Retry with back-off on `Could not establish connection` |

---

## 23. Chrome Storage

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 23.1 | `chrome.storage.local` read fails (corruption) | Extension unusable | Catch all storage errors; initialise with defaults if read fails |
| 23.2 | `chrome.storage.session` cleared on browser restart | Agent state lost | Acceptable per MV3 constraints; document for users |
| 23.3 | Storage quota exceeded (10 MB for local) | Write silently fails | Warn user when usage >8 MB; suggest exporting and deleting old skills |
| 23.4 | Concurrent reads/writes from multiple contexts | Race condition | Chrome storage is atomic per key; no special locking needed |

---

## 24. Side Panel UI

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 24.1 | Browser window resized very small | Panel elements overflow | Use responsive CSS; Chrome enforces min ~320px panel width |
| 24.2 | Panel opened on Chrome internal page, then user navigates to a normal page | Panel does not re-initialise | Listen for `chrome.tabs.onActivated` and `onUpdated`; reinitialise on tab change |
| 24.3 | Model output contains unsanitised HTML | XSS attack surface | Sanitise all model output before DOM insertion; use `textContent` for user-derived values |
| 24.4 | Slow machine causes panel to take >3s to render | User thinks it hung | Show loading skeleton immediately on any action click |
| 24.5 | Multiple features triggered simultaneously | UI state collision | Use global `isLoading` flag; disable all action buttons while any request is in-flight |
| 24.6 | Browser font size set to 200% (accessibility) | Text overflows elements | Use `em`/`rem` units; test at 200% browser zoom |
| 24.7 | Action log auto-scrolls away from user's reading position | User loses place | Auto-scroll to bottom only if user was already at bottom |

---

## 25. Cross-Tab and Navigation Scenarios

| ID | Scenario | Risk | Expected Behaviour |
|---|---|---|---|
| 25.1 | User opens a link in new tab while agent running | Agent context lost | Agent continues on original tab; new tab is unaffected |
| 25.2 | User switches active tab while Chat is open | Stale page context used | Detect via `chrome.tabs.onActivated`; update or reset context |
| 25.3 | User reloads active page mid-agent task | DOM changes; element IDs stale | Detect `chrome.tabs.onUpdated` with `status: loading`; pause agent; warn user |
| 25.4 | Extension open in two tabs with shared storage | Two panels see same agent state | Expected behaviour; document for users |
| 25.5 | Page uses History API (`pushState`) without full reload | `onUpdated` may not fire | Poll for URL change in content script as backup |
| 25.6 | User navigates forward/back with browser buttons | Content script from old page still active | Re-inject content script on `onUpdated` with `status: complete` |
| 25.7 | Page CSP blocks all scripts | Extension scripts blocked | MV3 extension content scripts bypass page CSP; document this |

---

## 26. Quick Reference: Priority Matrix

### Critical — Must Handle Before Release

| ID | Edge Case | Section |
|---|---|---|
| C1 | Empty API key shows no error | 2.1 |
| C2 | Service worker sleeps mid-agent-task | 18.1 |
| C3 | Model returns invalid JSON for agent action | 15.7 |
| C4 | Safety rail bypassed by renaming a password field | 21.3 |
| C5 | API key accidentally committed to git | 21.7 |
| C6 | `click()` on link opens new tab; agent context lost | 16.1 |
| C7 | Page navigates mid-agent; stale element map used | 25.3 |
| C8 | Rate limit (429) with no Groq key configured | 8.1 |
| C9 | Consequential action executes without extra confirmation | 21.5 |
| C10 | XSS via unsanitised model output rendered as HTML | 24.3 |

### Important — Handle Before Phase Acceptance Gate

| ID | Edge Case | Section |
|---|---|---|
| I1 | SPA content not loaded when Readability runs | 3.1 |
| I2 | Chat history grows beyond context window | 9.2 |
| I3 | Crop region is zero-size on screenshot | 11.3 |
| I4 | Element scanner finds 1000+ elements | 12.1 |
| I5 | Model repeats same action 3+ times in a row | 15.2 |
| I6 | React-controlled input not updated by value assignment | 16.3 |
| I7 | Approve clicked multiple times before disabled | 17.1 |
| I8 | Imported skills file is malformed JSON | 20.1 |
| I9 | `sendMessage` called when side panel is closed | 22.1 |
| I10 | Side panel opened on `chrome://` internal page | 1.3 |
| I11 | Model generates type action with a card number as value | 21.8 |
| I12 | Screenshot contains PII; no warning shown to user | 11.5 |

### Nice-to-Have — Address If Time Permits

| ID | Edge Case | Section |
|---|---|---|
| N1 | YouTube Shorts link format | 5.2 |
| N2 | Page text entirely in non-Latin script | 3.9 |
| N3 | Chat question in Hindi when page is English | 9.4 |
| N4 | Action log has >100 entries | 17.7 |
| N5 | Skill prompt uses an empty profile field | 20.4 |
| N6 | Extension used on incognito tab | 11.8 |
| N7 | Badges shift position on scroll | 12.4 |
| N8 | User AFK during approval for >10 minutes | 17.6 |
| N9 | `scroll` action does nothing (already at bottom) | 15.10 |
| N10 | Checkbox toggled to wrong state | 16.10 |

---

*Generated from `implementation-plan.md` + `architecture.md` — Sahayak v1.0 Edge Cases*
