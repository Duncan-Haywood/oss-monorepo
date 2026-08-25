export const DRAFT_STORAGE_KEY = 'janitorial-bid-draft';

export function saveDraft(storage, draft) {
  if (!storage) return false;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY) || 'null');
    if (!value || !Array.isArray(value.areas) || !value.costs || typeof value.costs !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

export function clearDraft(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
