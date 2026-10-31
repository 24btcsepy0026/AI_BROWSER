# 🚀 Sahayak — Your AI Browser Assistant

> **Read, Chat, See, and Act on any webpage or YouTube video.** A privacy-first, human-in-the-loop browser extension powered by Chrome Manifest V3, Mozilla Readability, Google Gemini 2.5 Flash, and Groq.

[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-8E75C2?logo=googlegemini&logoColor=white)](https://aistudio.google.com)
[![Groq Fast Inference](https://img.shields.io/badge/Fallback-Groq-F55036)](https://console.groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Key Features

### 📖 The Core (Reading & Summarisation)
- 📄 **Distraction-Free Article Summarisation:** Uses Mozilla Readability to extract clean article text without navbar/footer clutter and generates a structured summary with **TL;DR**, **5 Key Points**, and **What to do next**.
- 🎬 **YouTube Video Summaries with Interactive Timestamps:** Automatically parses YouTube watch pages and chapters, providing clickable timestamps (`[MM:SS]`) that seek directly to that moment in the active video.
- 🌐 **3-Way Regional Language Support (EN / HIN / TAN):** Instant multilingual switching:
  - **EN** (English)
  - **HIN** (Hinglish: natural Hindi + English code-mix in Latin alphabet)
  - **TAN** (Tanglish: natural Tamil + English code-mix in Latin alphabet)

### 👁️ The Senses (Chat, Context, & Vision)
- 💬 **Grounded Page Chat:** Ask any question about the open webpage with strict grounding—answers come strictly from page content, explicitly returning *"This information is not available on the current page"* if absent.
- 🖱️ **Right-Click Context Menu Actions:** Select any text on any page, right-click, and instantly trigger:
  - **Explain this:** Simplifies jargon, acronyms, and complex ideas.
  - **Translate:** Converts selected text to Hinglish, Tanglish, or English.
  - **Draft a reply:** Generates contextual, ready-to-copy responses.
- 📸 **Screenshot-and-Ask (Vision):** Capture visible tabs or drag-to-crop any region, then ask visual questions to Gemini 2.5 Flash.

### 🤖 The Hands (Interactive Agent with Human-in-the-Loop)
- 🏷️ **Interactive Element Scanner & Badges:** Scans the DOM and injects numbered visual badges (`[1]`, `[2]`, `[3]`...) directly above interactive elements.
- 🔍 **"Find It For Me":** Plain-language element search (e.g. *"Where do I enter my email?"*). Highlights the matched control with a glowing pulsing ring.
- 🛡️ **Autonomous Agent Loop:** One-step-at-a-time agent with strict human control:
  - **Approve:** Executes the proposed click, type, select, or scroll in the page DOM (includes React-controlled input support).
  - **Skip:** Skips the proposed step and re-plans.
  - **Dry Run:** Highlights the element on the live webpage without touching or altering DOM state.
  - **Stop Kill Switch:** Instantly halts agent execution and clears badges.
- 💾 **Session Persistence:** Agent state persists in `chrome.storage.session` across sidepanel closes and service worker idle periods.

### 🧠 Memory, Safety & Skills
- 👤 **Local Profile Memory:** Stores your name, college, skills, and links strictly on your device for one-click form auto-filling.
- ⚡ **One-Click Skills:** Prompt recipes for common workflows (Exam Notes, Explain in Hinglish, Reply Politely, Fill from Profile) with JSON import/export.
- 🔒 **8-Layer Code-Enforced Safety Rails:** Hard blocks on banking/payment domains and password/credential fields, plus second-confirmation dialogs for consequential actions.

---

## 🔒 8-Layer Safety Architecture

| Layer | Mechanism | Protection |
|:---:|:---|:---|
| **1** | **Domain Blocklist** | Blocks agent execution on banking, netbanking, and payment gateways (`safety.js`). |
| **2** | **Field Type Block** | Hard blocks on `password`, `tel`, OTP, PIN, and credit card number patterns (`\d{13,19}`). |
| **3** | **Second Confirmation** | Extra confirmation required for consequential actions (Submit, Pay, Order, Delete). |
| **4** | **Human Approval Gate** | No DOM action can execute without explicit user approval. |
| **5** | **Emergency Kill Switch** | Instant Stop button halts any running agent loop immediately. |
| **6** | **Dry Run Inspection** | Highlights elements with a pulsing ring to preview without firing events. |
| **7** | **Step Limit Auto-Stop** | Hard cap at 20 steps to prevent infinite execution loops. |
| **8** | **Credential Isolation** | API keys and profiles stored strictly in local storage; zero tracking, zero external servers. |

---

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|:---|:---|:---|
| **Core Architecture** | Chrome Extension Manifest V3 | Modern, secure extension platform |
| **UI System** | Vanilla HTML5 & CSS3 | Dark-mode design system with glassmorphism |
| **Content Extraction** | Mozilla Readability.js | Distraction-free article extraction |
| **Primary AI Model** | Google Gemini 2.5 Flash / Flash-Lite | Fast, multimodal reasoning & vision |
| **Fallback AI Model** | Groq (Llama 3.3 70B / 8B) | High-speed text inference on rate-limits |
| **State & Storage** | `chrome.storage.local` & `session` | Encrypted device-only persistence |

---

## 📦 Installation Guide (Under 5 Minutes)

### Step 1: Clone or Download
```bash
git clone https://github.com/<your-username>/AI_BROWSER.git
```
*(Or download and extract the release ZIP file from the [Releases](https://github.com/<your-username>/AI_BROWSER/releases) tab).*

### Step 2: Open Extensions in Chrome
Open Google Chrome and navigate to:
```text
chrome://extensions
```

### Step 3: Enable Developer Mode
In the top-right corner of the Extensions page, toggle **Developer mode** to **ON**.

### Step 4: Load Unpacked
1. Click the **Load unpacked** button in the top-left corner.
2. Select the repository root folder containing `manifest.json`.
3. Sahayak will appear in your extensions list! Pin it to your toolbar for easy access.

---

## ⚙️ Settings & API Key Setup

1. Click the **⚙️ Settings** icon in the Sahayak sidepanel header (or right-click extension icon → Options).
2. **Gemini API Key (Required):**
   - Get a free key at [Google AI Studio](https://aistudio.google.com).
   - Paste it into the **Gemini API Key** field.
3. **Groq API Key (Optional Fallback):**
   - Get a free key at [Groq Console](https://console.groq.com).
   - Paste it into the **Groq API Key** field for seamless fallback during rate limits.
4. **User Profile (Optional):**
   - Enter your name, college, skills, and links to enable automatic form filling.
5. Click **Save Settings**.

---

## 💡 How to Use

### 1. Summarise Articles & YouTube Videos
* Open any article or YouTube video.
* Click the Sahayak icon in your browser toolbar to open the Side Panel.
* Click **Summarise** on the Home tab. Toggle between **EN**, **HIN** (Hinglish), and **TAN** (Tanglish) at any time.

### 2. Grounded Page Chat
* Switch to the **Chat** tab in the side panel.
* Ask questions about the current page. Answers are strictly verified against the page content.

### 3. Screenshot & Visual Q&A
* Click **Screenshot** on the Home tab.
* Preview the captured tab or drag a rectangle to crop a specific chart, code snippet, or error message.
* Ask questions about the visual and click **Ask Sahayak**.

### 4. Human-in-the-Loop Agent
* Switch to the **Agent** tab.
* Click **🏷️ Scan Page Elements** to view numbered badges on all inputs, buttons, and links.
* Enter a goal (e.g. *"Fill username field with my email and submit"*).
* Click **Start**: Sahayak plans each step and presents an **Approval Card** before executing.

### 5. One-Click Skills
* Switch to the **Skills** tab.
* Run built-in skills like **Exam Notes** or **Explain in Hinglish**, or click **+ New** to create custom prompt recipes.
* Use **Export** and **Import** to backup or share your skills with teammates.

---

## 🧑‍💻 Contributing & Development

We welcome contributions! To test changes locally:

1. Edit files directly in the codebase.
2. Visit `chrome://extensions` and click the **🔄 Reload** button on Sahayak.
3. Run syntax validation before committing:
   ```bash
   node --experimental-vm-modules scripts/validate.js
   ```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
