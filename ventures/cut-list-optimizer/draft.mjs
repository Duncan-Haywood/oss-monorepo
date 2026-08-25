const PREFIX = 'cut-list-optimizer-draft-';

export const DRAFT_KEYS = ['sheet', 'linear'];

export function saveDraft(storage, mode, values) {
  if (!storage || !DRAFT_KEYS.includes(mode)) return false;
  try {
    storage.setItem(`${PREFIX}${mode}`, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage, mode) {
  if (!storage || !DRAFT_KEYS.includes(mode)) return null;
  try {
    const value = JSON.parse(storage.getItem(`${PREFIX}${mode}`) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearDraft(storage, mode) {
  if (!storage || !DRAFT_KEYS.includes(mode)) return;
  try { storage.removeItem(`${PREFIX}${mode}`); } catch { /* storage can be unavailable */ }
}
