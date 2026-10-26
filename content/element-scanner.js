// ============================================================
// Sahayak - Element Scanner (content/element-scanner.js)
// Slice 3.1: Interactive Element Scanner
// Scans DOM and builds a numbered action map.
// ============================================================

const INTERACTIVE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="tab"]'
];

/**
 * Checks whether an element is truly visible to the user.
 * Filters out hidden, collapsed, 0-opacity, or 0-dimension elements.
 */
function isVisible(el) {
  if (!el) return false;

  // Do not scan Sahayak's own UI elements
  if (el.closest('.sahayak-badge') || el.classList.contains('sahayak-badge')) return false;
  if (el.id === 'sahayak-badges-container') return false;

  // Accessibility hidden
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(el);
  if (!style) return false;

  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

/**
 * Extracts a concise, human-readable label for an element.
 * Follows a prioritized fallback chain and escapes quotes.
 */
function getLabel(el) {
  const rawLabel = (
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    (el.innerText && el.innerText.trim().substring(0, 60)) ||
    el.getAttribute('name') ||
    el.getAttribute('title') ||
    (el.value && typeof el.value === 'string' && el.value.trim().substring(0, 60)) ||
    (el.querySelector('img') && el.querySelector('img').getAttribute('alt')) ||
    el.tagName.toLowerCase()
  );

  const clean = String(rawLabel || '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 60);

  // Escape double quotes to prevent breaking JSON/action maps
  return clean.replace(/"/g, '\\"');
}

/**
 * Generates a stable CSS selector for an element.
 */
function generateSelector(el) {
  if (el.id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(el.id)) {
    return `#${CSS.escape(el.id)}`;
  }

  const sahayakId = el.getAttribute('data-sahayak-id');
  if (sahayakId) {
    return `[data-sahayak-id="${sahayakId}"]`;
  }

  const name = el.getAttribute('name');
  if (name) {
    return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  // Fallback: tag + class or tag path
  let selector = el.tagName.toLowerCase();
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(c => !c.startsWith('sahayak-'));
    if (classes.length > 0) {
      selector += '.' + CSS.escape(classes[0]);
    }
  }
  return selector;
}

/**
 * Scans the active document for interactive elements.
 * Returns up to 50 elements, prioritizing those in the current viewport.
 */
function scanInteractiveElements() {
  const elements = [];
  const foundSet = new Set();
  const rawCandidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS.join(',')));

  // Separate into in-viewport and out-of-viewport
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;

  const inViewport = [];
  const outViewport = [];

  rawCandidates.forEach(el => {
    if (!isVisible(el)) return;
    if (foundSet.has(el)) return;
    foundSet.add(el);

    const rect = el.getBoundingClientRect();
    const isInView = rect.top >= -50 && rect.top <= vh && rect.left >= -50 && rect.left <= vw;
    if (isInView) {
      inViewport.push({ el, rect });
    } else {
      outViewport.push({ el, rect });
    }
  });

  // Prioritize viewport, cap at 50 elements max (edge cases 12.1 / 13.1)
  const prioritized = [...inViewport, ...outViewport].slice(0, 50);

  let id = 1;
  prioritized.forEach(({ el, rect }) => {
    const elementId = id++;
    el.setAttribute('data-sahayak-id', String(elementId));

    elements.push({
      id: elementId,
      tag: el.tagName.toLowerCase(),
      type: el.type || el.getAttribute('role') || '',
      label: getLabel(el),
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
        right: Math.round(rect.right)
      },
      selector: generateSelector(el)
    });
  });

  return elements;
}

/**
 * Builds compact action map text representation for AI prompts.
 * Format: [1] button: "Submit Application"
 */
function buildActionMapText(elements) {
  if (!elements || elements.length === 0) return 'No interactive elements found on this page.';
  return elements.map(el =>
    `[${el.id}] ${el.tag}${el.type ? `(${el.type})` : ''}: "${el.label}"`
  ).join('\n');
}

// Make functions accessible in content script environment
window.scanInteractiveElements = scanInteractiveElements;
window.buildActionMapText = buildActionMapText;
window.getLabel = getLabel;
window.isVisible = isVisible;
window.generateSelector = generateSelector;
