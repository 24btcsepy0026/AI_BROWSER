# Sahayak v1.0.0 Release Notes

> **Your AI Browser Assistant — Read, Chat, See, and Act on any Webpage.**

We are thrilled to present **Sahayak v1.0.0**, an AI browser assistant Chrome extension built with modern Manifest V3, human-in-the-loop autonomous agent capabilities, multimodal vision, and strict 8-layer safety guardrails.

---

## 🚀 Key Features

### 1. 📖 The Eyes: Web Reading & Video Parsing (Phase 1)
- **Article Summarisation**: Powered by Mozilla's `Readability.js`, extracts clean article text stripping clutter and ads, producing a structured *TL;DR + 5 Key Takeaways + Next Step*.
- **YouTube Video Summariser**: Paste or open any YouTube video to automatically extract timestamps and generate concise chronological section summaries without leaving the page.
- **Language Toggle (English ⇄ Hinglish)**: Instant code-switched Hinglish explanations designed for bilingual users and Indian college/tech contexts.
- **Side Panel Experience**: Seamless Chrome Side Panel integration that remains accessible alongside your active tab without stealing window focus.

### 2. 🧠 The Brain: Grounded Chat & Visual Understanding (Phase 2)
- **Grounded Page Chat**: Ask questions directly about the active page. Uses strict hallucination-prevention prompts: if information is not on the page, Sahayak clearly states *"Not available on current page"*.
- **Right-Click Context Menu Actions**: Highlight text on any page and right-click to instantly:
  - *Sahayak: Explain this*
  - *Sahayak: Translate*
  - *Sahayak: Draft a reply*
- **Screenshot-and-Ask (Multimodal Vision)**: Capture full viewport or cropped page regions to query charts, diagrams, tables, or image contents with Gemini 2.5 Flash Vision.
- **Free-Tier Resilience**: Intelligent fallback between Google Gemini (`gemini-2.5-flash` / `gemini-1.5-flash`) and Groq (`llama-3.3-70b-versatile`) with exponential backoff on HTTP 429 rate limits.

### 3. 🖐️ The Hands: Browser Action Agent (Phase 3)
- **Interactive Element Scanner**: Scans visible interactive DOM elements (buttons, inputs, links, dropdowns) and overlays non-destructive, numbered badges.
- **"Find It For Me" (NL Element Selection)**: Enter queries like *"Where do I enter my email?"* or *"Sign up button"* and Sahayak scrolls and pulses a gold glow around the exact element.
- **Human-in-the-Loop Agent Loop**: Autonomous form-filling and navigation agent that proposes single steps as strict JSON. **Zero browser actions execute without explicit human approval**.
- **Action Approval Card**: Displays proposed Action, Target description, Value, and Reason with:
  - `✓ Approve` — Executes step in page DOM.
  - `↷ Skip` — Re-plans around the element.
  - `👁 Dry Run` — Highlights element on the live webpage without clicking/typing.
  - `✕ Stop` — Emergency kill switch that halts execution immediately.
- **Service Worker Lifecycle Persistence**: Agent state persists across Chrome service worker sleeping cycles in `chrome.storage.session`.

### 4. 🛡️ Memory, Personalisation & Safety (Phase 4)
- **Local Profile Memory**: Secure on-device profile storage (`chrome.storage.local`) storing your Name, College, Skills, GitHub, LinkedIn, and preferred tone for automated form filling.
- **One-Click Custom Skills**: Create, save, export, and import custom prompt recipes with JSON schema:
  - *Built-in Starter Skills*: Exam Notes, Explain in Hinglish, Reply Politely, Fill from Profile.
- **8-Layer Code-Enforced Safety Rails**:
  1. *Domain Blocklist*: Refuses to act on banking, payment, or checkout sites (`onlinesbi.com`, `hdfcbank.com`, `razorpay.com`, `stripe.com`, `paypal.com`, netbanking URLs).
  2. *Credential & Sensitive Field Defense*: Code-level rejection of typing into `password`, `tel`, OTP, PIN, CVV, or card number fields.
  3. *Consequential Action Confirmation*: Second confirmation dialog before submitting, paying, or deleting.
  4. *Human Approval Gate*: Every browser interaction requires manual user click.
  5. *Emergency Stop Kill Switch*: Instantly halts the agent and removes all overlays.
  6. *Dry Run Mode*: Preview element selection before executing.
  7. *Auto Step Limit*: Automatic cutoff at 20 steps to prevent infinite loops.
  8. *API Key Isolation*: Stored in local extension storage; never sent to third-party tracking or committed to version control.

---

## 📦 Distribution Artifacts

- **Production Package**: `sahayak-v1.0.0.zip` (108 KB) ready to extract and load via Chrome Developer Mode.
- **Landing Page**: `landing/index.html` with responsive presentation, glassmorphism cards, and instant download button.
- **License**: MIT License.

---

## 🛠️ Quick Installation (4 Steps)

1. Download **`sahayak-v1.0.0.zip`** from this release and unzip it into a folder.
2. In Google Chrome, go to `chrome://extensions/` and toggle **Developer mode** (top right) ON.
3. Click **Load unpacked** and select the unzipped extension directory.
4. Click the Sahayak extension icon, go to **Settings (⚙️)**, and enter your free **Google Gemini** or **Groq** API key.
