// ============================================================
// Sahayak - Safety Rails (background/safety.js)
// Slice 4.3: 8-Layer Safety Architecture
// Code-enforced guardrails that no AI model prompt can bypass.
// ============================================================

export const BLOCKED_DOMAIN_PATTERNS = [
  /netbanking/i,
  /onlinesbi\.com/i,
  /hdfcbank\.com/i,
  /icicibank\.com/i,
  /axisbank\.com/i,
  /kotak\.com/i,
  /paytm\.com/i,
  /phonepe\.com/i,
  /razorpay\.com/i,
  /stripe\.com/i,
  /paypal\.com/i,
  /checkout\./i,
  /payment\./i,
  /bank/i,
];

export const BLOCKED_INPUT_TYPES = ['password', 'tel'];

export const BLOCKED_AUTOCOMPLETE = [
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-type',
  'new-password',
  'current-password',
  'one-time-code',
];

export const CONSEQUENTIAL_LABELS = [
  'submit',
  'pay',
  'send',
  'confirm',
  'purchase',
  'book',
  'delete',
  'remove',
  'proceed',
  'checkout',
  'place order',
  'transfer',
  'send payment',
];

/**
 * Checks whether a URL belongs to a blocked banking/payment domain.
 * Evaluates hostname to prevent false positives on educational articles (Edge case 21.1 & 21.2).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isBlockedDomain(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return BLOCKED_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return BLOCKED_DOMAIN_PATTERNS.some((pattern) => pattern.test(url));
  }
}

/**
 * Checks whether an element is sensitive or protected.
 *
 * @param {Object} element - Scanned element metadata
 * @returns {{blocked: boolean, reason?: string}}
 */
export function isBlockedField(element) {
  if (!element) return { blocked: false };

  const type = (element.type || '').toLowerCase();
  const autocomplete = (element.autocomplete || '').toLowerCase();
  const name = (element.name || element.label || '').toLowerCase();

  if (BLOCKED_INPUT_TYPES.includes(type)) {
    return { blocked: true, reason: `Cannot interact with ${type} fields for security.` };
  }

  if (BLOCKED_AUTOCOMPLETE.some((a) => autocomplete.includes(a))) {
    return { blocked: true, reason: 'Cannot type into sensitive payment or credential fields.' };
  }

  if (/otp|password|passcode|pin|cvv|cvc|card\.?number|secret/i.test(name)) {
    return { blocked: true, reason: 'Cannot type into protected credential fields.' };
  }

  return { blocked: false };
}

/**
 * Checks whether an action targets a consequential action button.
 *
 * @param {Object} action - Proposed action
 * @param {Array} elements - Elements snapshot
 * @returns {boolean}
 */
export function isConsequentialAction(action, elements = []) {
  if (!action || !action.element) return false;
  const el = elements.find((e) => e.id === action.element);
  if (!el) return false;

  const label = (el.label || '').toLowerCase();
  const isSubmitType = el.type === 'submit';

  return isSubmitType || CONSEQUENTIAL_LABELS.some((conseq) => label.includes(conseq));
}

/**
 * Comprehensive 8-Layer Safety check for proposed agent actions.
 *
 * @param {Object} action - Proposed action { action, element, value, reason }
 * @param {Array} elements - Snapshot of scanned elements
 * @param {string} tabUrl - Active page URL
 * @returns {{allowed: boolean, reason?: string, requiresExtraConfirm?: boolean}}
 */
export function checkActionSafety(action, elements = [], tabUrl = '') {
  // Layer 1: Domain Blocklist
  if (isBlockedDomain(tabUrl)) {
    return {
      allowed: false,
      reason: 'Sahayak cannot act on banking or payment pages for your safety.',
    };
  }

  // Layer 2: Sensitive Field Types & Credential Names
  if (action.action === 'type' && action.element) {
    const el = elements.find((e) => e.id === action.element);
    if (el) {
      const fieldCheck = isBlockedField(el);
      if (fieldCheck.blocked) {
        return { allowed: false, reason: fieldCheck.reason };
      }
    }

    // Layer 2b: Credit Card Number Entry Detection (Edge case 21.8)
    if (action.value) {
      const rawVal = String(action.value).replace(/[\s-]/g, '');
      if (/^\d{13,19}$/.test(rawVal)) {
        return {
          allowed: false,
          reason: 'Blocked for safety: Detection of credit/debit card number entry.',
        };
      }
    }
  }

  // Layer 3: Consequential Action Second-Confirmation
  const requiresExtraConfirm = isConsequentialAction(action, elements);

  return {
    allowed: true,
    requiresExtraConfirm,
  };
}
