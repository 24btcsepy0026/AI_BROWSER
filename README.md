# Sahayak — AI Browser Assistant (Chrome Extension)

> **Read, summarize, and understand any webpage or YouTube video directly inside your browser.** Built with Chrome Manifest V3, Mozilla Readability, and Google Gemini.

---

## 🌟 Key Features (Phase 1)

- 📄 **Clean Article Summarisation:** Uses Mozilla Readability to extract article text without navbar/footer clutter and generates a structured summary with **TL;DR**, **5 Key Points**, and **What to do next**.
- 🎬 **YouTube Video Summaries with Interactive Timestamps:** Automatically detects YouTube watch pages and Shorts, summarizing chapters with clickable timestamps (`[MM:SS]`) that jump directly to that point in the active video.
- 🌐 **3-Way Regional Language Toggle (EN / HIN / TAN):** Instant multilingual switching:
  - **EN** (English)
  - **HIN** (Hinglish: natural Hindi + English code-mix in Latin alphabet)
  - **TAN** (Tanglish: natural Tamil + English code-mix in Latin alphabet)
  - Clicking the toggle re-runs the summary in real-time.
- ⚡ **Multi-Model Fallback Gateway:** Powered by `model-router.js` with exponential backoff on HTTP 429 and automatic fallback across Gemini models and Groq backup.
- 🔒 **Privacy-First & Secure Storage:** API keys are stored strictly in `chrome.storage.local` with masked views; never exposed in source code or sent to third parties.

---

## 🚀 Quick Setup & Installation

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/<your-username>/Sahayak-AI-Browser-Assistant.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension folder containing `manifest.json`.
5. Open the **Settings** page (Right-click extension icon > Options, or click the gear icon in the side panel).
6. Enter your free **Gemini API key** and click **Save Settings**.
7. Navigate to any news article, Wikipedia page, or YouTube video, open the **Side Panel**, and click **📝 Summarise**!

---

## 🛠️ Architecture & Tech Stack

- **Manifest:** Chrome Extensions Manifest V3 (MV3)
- **UI:** Chrome Side Panel API (`chrome.sidePanel`) with Vanilla CSS & HTML
- **Content Parser:** Mozilla Readability (`lib/Readability.js`)
- **AI Gateway:** Google Gemini API (`gemini-flash-lite-latest`, `gemini-3.5-flash-lite`) via `background/model-router.js`
- **Storage:** Chrome Local Storage (`chrome.storage.local`)