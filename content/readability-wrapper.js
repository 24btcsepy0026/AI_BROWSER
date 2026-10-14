// ============================================================
// Sahayak â€“ Readability Wrapper (content/readability-wrapper.js)
// Extracts clean article text using Mozilla Readability.
// Injected alongside Readability.js by the service worker.
// ============================================================

/**
 * Attempts to extract the main article content from the page.
 * First tries Mozilla Readability; falls back to raw body text.
 *
 * @returns {{
 *   type:         'article' | 'raw',
 *   title:        string,
 *   text:         string,
 *   byline:       string | null,
 *   siteName:     string | null,
 *   url:          string,
 *   wordCount:    number,
 *   extractedAt:  number,
 * }}
 */
function extractPageContent() {
  const MIN_ARTICLE_LENGTH = 200;   // chars - below this we treat as non-article
  const MAX_TEXT_LENGTH    = 15000; // chars - cap sent to AI to keep within context

  // Try Readability
  if (typeof Readability !== 'undefined') {
    try {
      // Always clone so we don't mutate the live DOM
      const docClone = document.cloneNode(true);
      const reader   = new Readability(docClone, { keepClasses: false });
      const article  = reader.parse();

      if (
        article &&
        article.textContent &&
        article.textContent.trim().length > MIN_ARTICLE_LENGTH
      ) {
        const text = article.textContent.trim().substring(0, MAX_TEXT_LENGTH);
        return {
          type:        'article',
          title:       article.title    || document.title || '',
          text,
          byline:      article.byline   || null,
          siteName:    article.siteName || null,
          url:         location.href,
          wordCount:   text.split(/\s+/).length,
          extractedAt: Date.now(),
        };
      }
    } catch (err) {
      console.warn('[Sahayak] Readability parse error, falling back to raw:', err.message);
    }
  }

  // Raw body fallback
  const rawText = (document.body ? document.body.innerText : '').trim().substring(0, MAX_TEXT_LENGTH);
  return {
    type:        'raw',
    title:       document.title || '',
    text:        rawText,
    byline:      null,
    siteName:    null,
    url:         location.href,
    wordCount:   rawText.split(/\s+/).length,
    extractedAt: Date.now(),
  };
}

// YouTube detection helpers
function isYouTubePage() {
  const host = location.hostname.toLowerCase();
  const path = location.pathname.toLowerCase();
  return (
    (host.includes('youtube.com') && (path === '/watch' || path.startsWith('/shorts/'))) ||
    host.includes('youtu.be')
  );
}

function getYouTubeVideoId() {
  const host = location.hostname.toLowerCase();
  if (host.includes('youtu.be')) {
    return location.pathname.substring(1).split('?')[0] || null;
  }
  if (location.pathname.startsWith('/shorts/')) {
    return location.pathname.replace('/shorts/', '').split('/')[0].split('?')[0] || null;
  }
  var params = new URLSearchParams(location.search);
  return params.get('v') || null;
}

function extractYouTubeMetadata() {
  const videoId = getYouTubeVideoId();
  const rawTitle = document.title ? document.title.replace(' - YouTube', '').trim() : '';
  const channelEl = document.querySelector('#channel-name, ytd-channel-name, #owner, ytd-video-owner-renderer');
  const descEl = document.querySelector('#description-text, ytd-expander, #description, #snippet');

  return {
    videoId:     videoId,
    title:       rawTitle || 'YouTube Video',
    channel:     channelEl ? channelEl.textContent.trim() : '',
    description: descEl ? descEl.textContent.trim().substring(0, 1200) : '',
    url:         location.href,
    extractedAt: Date.now(),
  };
}
