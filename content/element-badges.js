// ============================================================
// Sahayak - Element Badges (content/element-badges.js)
// Slice 3.1 & 3.2: Numbered Visual Badges & Pulsing Highlights
// ============================================================

/**
 * Injects CSS rules for badges and pulsing highlights.
 */
function ensureBadgeStyles() {
  if (document.getElementById('sahayak-badge-styles')) return;

  const style = document.createElement('style');
  style.id = 'sahayak-badge-styles';
  style.textContent = `
    .sahayak-badge {
      position: absolute;
      background: #4F46E5;
      color: #ffffff;
      font-size: 11px;
      font-weight: bold;
      border-radius: 3px;
      padding: 1px 5px;
      z-index: 2147483647;
      pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      line-height: 14px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.4);
      user-select: none;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .sahayak-badge--active {
      background: #F59E0B !important;
      color: #000000 !important;
      transform: scale(1.35);
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.8) !important;
      z-index: 2147483647 !important;
    }

    @keyframes sahayak-pulse-ring {
      0% {
        box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7), 0 0 10px rgba(79, 70, 229, 0.4);
      }
      70% {
        box-shadow: 0 0 0 12px rgba(79, 70, 229, 0), 0 0 20px rgba(79, 70, 229, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(79, 70, 229, 0), 0 0 0 rgba(79, 70, 229, 0);
      }
    }

    .sahayak-highlight {
      outline: 3px solid #4F46E5 !important;
      outline-offset: 3px !important;
      animation: sahayak-pulse-ring 1.8s infinite !important;
      transition: outline 0.2s ease, box-shadow 0.2s ease !important;
      border-radius: 4px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Renders numbered badges over all supplied interactive elements.
 * @param {Array<{id: number, rect: {top: number, left: number}}>} elements
 */
function renderBadges(elements) {
  clearBadges();
  ensureBadgeStyles();

  if (!elements || elements.length === 0) return;

  const scrollY = window.scrollY || window.pageYOffset || 0;
  const scrollX = window.scrollX || window.pageXOffset || 0;

  const fragment = document.createDocumentFragment();

  elements.forEach(el => {
    // If element is in DOM, recalculate live rect for maximum precision
    const domEl = document.querySelector(`[data-sahayak-id="${el.id}"]`);
    const liveRect = domEl ? domEl.getBoundingClientRect() : el.rect;

    const badge = document.createElement('span');
    badge.className = 'sahayak-badge';
    badge.dataset.sahayakBadgeId = String(el.id);
    badge.textContent = el.id;

    // Position at top-left corner of the element
    const topPos = Math.max(0, liveRect.top + scrollY - 10);
    const leftPos = Math.max(0, liveRect.left + scrollX - 8);

    badge.style.top = `${topPos}px`;
    badge.style.left = `${leftPos}px`;

    fragment.appendChild(badge);
  });

  document.body.appendChild(fragment);
}

/**
 * Clears all Sahayak badges and active highlights from the page.
 */
function clearBadges() {
  document.querySelectorAll('.sahayak-badge').forEach(b => b.remove());
  document.querySelectorAll('.sahayak-highlight').forEach(el => {
    el.classList.remove('sahayak-highlight');
  });
}

/**
 * Highlights a specific element by ID with a pulsing outline
 * and scrolls it into view.
 *
 * @param {number|string} id - The 1-based element number
 * @returns {boolean} True if found and highlighted
 */
function highlightElement(id) {
  ensureBadgeStyles();

  // Clear any existing highlight
  document.querySelectorAll('.sahayak-highlight').forEach(el => {
    el.classList.remove('sahayak-highlight');
  });
  document.querySelectorAll('.sahayak-badge--active').forEach(b => {
    b.classList.remove('sahayak-badge--active');
  });

  const domEl = document.querySelector(`[data-sahayak-id="${id}"]`);
  if (!domEl) return false;

  // Scroll into view smoothly
  domEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

  // Add pulsing highlight class
  domEl.classList.add('sahayak-highlight');

  // Highlight badge as well
  const badge = document.querySelector(`.sahayak-badge[data-sahayak-badge-id="${id}"]`);
  if (badge) {
    badge.classList.add('sahayak-badge--active');
  }

  return true;
}

// Make functions accessible globally in content script
window.renderBadges = renderBadges;
window.clearBadges = clearBadges;
window.highlightElement = highlightElement;
