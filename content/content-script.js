// ============================================================
// Sahayak - Content Script (content/content-script.js)
// Injected into web pages by the service worker on demand.
// Listens for messages and delegates to readability-wrapper.js
// ============================================================

// Guard: prevent double-injection if script is injected twice
if (typeof window.__sahayakContentScriptLoaded === 'undefined') {
  window.__sahayakContentScriptLoaded = true;

  // Listen for messages from the service worker
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_CONTENT') {
      handleExtractContent(sendResponse);
      return true; // keep channel open for async response
    }

    if (msg && msg.type === 'PING') {
      sendResponse({ alive: true });
      return true;
    }

    if (msg && msg.type === 'CHECK_SCANNER') {
      var hasScanner = (typeof scanInteractiveElements === 'function') || (typeof window.scanInteractiveElements === 'function');
      sendResponse({ ready: hasScanner });
      return true;
    }

    if (msg && msg.type === 'GET_SELECTION') {
      var selText = window.getSelection ? window.getSelection().toString() : '';
      sendResponse({ text: selText.trim() });
      return true;
    }

        if (msg && msg.type === 'SEEK_VIDEO') {
      const video = document.querySelector('video');
      if (video && typeof msg.seconds === 'number') {
        video.currentTime = msg.seconds;
        video.play().catch(() => {});
        sendResponse({ success: true, currentTime: video.currentTime });
      } else {
        sendResponse({ success: false, error: 'No video element found on page.' });
      }
      return true;
    }

    // Slice 3.1 & 3.2: Element scanning, badges, and highlighting
    if (msg && msg.type === 'SCAN_ELEMENTS') {
      handleScanElements(msg.payload || {}, sendResponse);
      return true;
    }

    if (msg && msg.type === 'CLEAR_BADGES') {
      if (typeof clearBadges === 'function') clearBadges();
      sendResponse({ success: true });
      return true;
    }

    if (msg && msg.type === 'EXECUTE_ACTION') {
      var execFn = (typeof executeAction === 'function') ? executeAction : window.executeAction;
      if (typeof execFn !== 'function') {
        sendResponse({ success: false, error: 'Action executor is not available in page context.' });
        return true;
      }
      execFn(msg.payload ? msg.payload.action : null, msg.payload ? msg.payload.elements : [])
        .then(function(res) { sendResponse(res || { success: true }); })
        .catch(function(err) { sendResponse({ success: false, error: err.message }); });
      return true;
    }

    if (msg && msg.type === 'HIGHLIGHT_ELEMENT') {
      var elementId = msg.elementId || (msg.payload && msg.payload.elementId);
      var found = typeof highlightElement === 'function' ? highlightElement(elementId) : false;
      sendResponse({ success: found, elementId: elementId });
      return true;
    }
  });

  /**
   * Extracts page content and sends it back to the service worker.
   * @param {Function} sendResponse
   */
  function handleExtractContent(sendResponse) {
    try {
      // Special handling for YouTube watch pages
      if (typeof isYouTubePage === 'function' && isYouTubePage()) {
        var meta = typeof extractYouTubeMetadata === 'function' ? extractYouTubeMetadata() : {};
        sendResponse({
          success: true,
          isYouTube: true,
          data: meta,
        });
        return;
      }

      // Regular page - use Readability extraction
      if (typeof extractPageContent === 'function') {
        var result = extractPageContent();
        sendResponse({
          success: true,
          isYouTube: false,
          data: result,
        });
      } else {
        var rawText = (document.body ? document.body.innerText : '').trim().substring(0, 15000);
        sendResponse({
          success: true,
          isYouTube: false,
          data: {
            type: 'raw',
            title: document.title || '',
            text: rawText,
            url: location.href,
            wordCount: rawText.split(/\s+/).length,
            extractedAt: Date.now()
          }
        });
      }
    } catch (err) {
      console.error('[Sahayak] Content extraction failed:', err);
      sendResponse({
        success: false,
        error: err.message || 'Unknown extraction error',
      });
    }
  }

  /**
   * Scans interactive elements, optionally renders badges, and formats action map.
   * @param {Object} options
   * @param {Function} sendResponse
   */
  function handleScanElements(options, sendResponse) {
    try {
      var scanFn = (typeof scanInteractiveElements === 'function') ? scanInteractiveElements : window.scanInteractiveElements;
      if (typeof scanFn !== 'function') {
        throw new Error('Element scanner is not available in page context.');
      }
      var elements = scanFn();
      var renderFn = (typeof renderBadges === 'function') ? renderBadges : window.renderBadges;
      if (options.renderBadges !== false && typeof renderFn === 'function') {
        renderFn(elements);
      }
      var mapFn = (typeof buildActionMapText === 'function') ? buildActionMapText : window.buildActionMapText;
      var actionMapText = (typeof mapFn === 'function') ? mapFn(elements) : '';
      sendResponse({
        success: true,
        count: elements.length,
        actionMapText: actionMapText,
        elements: elements
      });
    } catch (err) {
      console.error('[Sahayak] Scan elements failed:', err);
      sendResponse({
        success: false,
        error: err.message || 'Unknown scan error'
      });
    }
  }
}
