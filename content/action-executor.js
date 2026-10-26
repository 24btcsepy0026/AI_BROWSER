// ============================================================
// Sahayak - Action Executor (content/action-executor.js)
// Slice 3.3: Action Execution in Webpage DOM
// Executes click, type, select, scroll on live elements.
// ============================================================

/**
 * Executes an agent action against page DOM elements.
 *
 * @param {Object} action - { action, element, value, reason }
 * @param {Array} elements - Snapshot of scanned elements
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function executeAction(action, elements = []) {
  if (!action || !action.action) {
    return { success: false, error: 'Invalid action object received.' };
  }

  // Done action - no DOM modification needed
  if (action.action === 'done') {
    return { success: true, message: 'Task finished.' };
  }

  // Scroll action
  if (action.action === 'scroll') {
    const isUp = action.value === 'up' || action.value === -1;
    window.scrollBy({ top: isUp ? -500 : 500, behavior: 'smooth' });
    return { success: true };
  }

  // Find target element by data-sahayak-id attribute
  let target = null;
  if (action.element) {
    target = document.querySelector(`[data-sahayak-id="${action.element}"]`);
  }

  // Fallback: look up in elements snapshot and try CSS selector
  if (!target && elements && elements.length > 0) {
    const elMeta = elements.find(e => e.id === action.element);
    if (elMeta && elMeta.selector) {
      try {
        target = document.querySelector(elMeta.selector);
      } catch (e) {
        // Selector error
      }
    }
  }

  if (!target) {
    return { success: false, error: `Target element [${action.element}] could not be found on the page.` };
  }

  // Scroll smoothly into center view before performing interaction
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch (e) {}

  switch (action.action) {
    case 'click': {
      if (target.disabled) {
        return { success: false, error: `Element [${action.element}] is currently disabled.` };
      }
      target.focus();
      target.click();
      return { success: true };
    }

    case 'type': {
      if (target.disabled || target.readOnly) {
        return { success: false, error: `Element [${action.element}] is not editable.` };
      }

      target.focus();
      const val = action.value != null ? String(action.value) : '';

      // Edge case 16.3: Support React & modern framework controlled inputs
      const prototype = target instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(target, val);
      } else {
        target.value = val;
      }

      // Fire standard events for full framework reactivity
      target.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return { success: true };
    }

    case 'select': {
      target.focus();
      const val = action.value != null ? String(action.value) : '';
      target.value = val;
      target.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return { success: true };
    }

    default:
      return { success: false, error: `Unsupported agent action: ${action.action}` };
  }
}

// Make globally accessible in content script scope
window.executeAction = executeAction;
