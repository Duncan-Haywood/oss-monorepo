export const DRAFT_KEY = 'cut-list-optimizer-draft-v1';

/**
 * Every form field that makes up a cutting plan, in both panels.
 *
 * Lifted out of `index.html` when `share.mjs` arrived and needed the same list.
 * A second copy would have gone stale the first time a field was added, and
 * silently: a draft or a link that drops a field still restores, just onto the
 * recipient's default instead of the sender's number. `share.test.mjs` pins the
 * two uses to this one definition.
 */
export const DRAFT_FIELDS = Object.freeze([
  'sheet-width', 'sheet-height', 'sheet-kerf', 'sheet-trim', 'sheet-cost',
  'sheet-parts', 'sheet-onhand', 'sheet-unit', 'sheet-rotate',
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
