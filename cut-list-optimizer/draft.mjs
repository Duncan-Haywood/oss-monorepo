export const DRAFT_KEY = 'cut-list-optimizer-draft-v1';

/**
 * Every form field that makes up a cutting plan, in both panels.
 *
 * Lifted out of `index.html` when `share.mjs` arrived and needed the same list.
 * A second copy would have gone stale the first time a field was added, and
 * silently: a draft or a link that drops a field still restores, just onto the
 * recipient's default instead of the sender's number. `share.test.mjs` pins the
 * two uses to this one definition.
 *
 * **The six `sheet-alt*` entries were missing until 2026-09-06, and the way
 * they were missed is the reason the list below is now checked in both
 * directions.** Having one definition stops the two *uses* drifting apart; it
 * does nothing about this list drifting from the form, and that is what
 * happened when the alternative-sheet comparison was added to `index.html`
 * without being added here. `share.test.mjs` already asserted that every name
 * here exists in the markup — the containment that catches a typo or a removed
 * field — but never the converse, so six live inputs sat outside the list and
 * every check stayed green. A shared plan carried the sender's primary sheet
 * and the *recipient's* defaults for both alternatives, under a headline that
 * matched: a complete, plausible, different comparison, which is exactly the
 * failure `platform/pages/roundtrip.mjs` was written for after
 * `where-to-sell-calculator` and `shopify-fee-calculator` shipped it. That run
 * is what found this one. `share.test.mjs` now asserts the converse too, so
 * the next field added to the form fails a test instead of a customer.
 *
 * `optout` is deliberately not here and must not be added: it is the visitor's
 * own privacy preference for this browser, not part of the plan, and putting
 * it in a link would apply the sender's choice to the recipient's device.
 */
export const DRAFT_FIELDS = Object.freeze([
  'sheet-width', 'sheet-height', 'sheet-kerf', 'sheet-trim', 'sheet-cost',
  'sheet-parts', 'sheet-onhand', 'sheet-unit', 'sheet-rotate',
  'sheet-alt1-width', 'sheet-alt1-height', 'sheet-alt1-cost',
  'sheet-alt2-width', 'sheet-alt2-height', 'sheet-alt2-cost',
  'stock', 'kerf', 'cuts', 'unit', 'stock-cost', 'onhand', 'currency',
]);

export function loadDraft(storage) {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(storage, draft) {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage) {
  try {
    storage?.removeItem(DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
