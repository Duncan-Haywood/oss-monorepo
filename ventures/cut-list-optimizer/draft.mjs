export const DRAFT_KEY = 'cut-list-optimizer-draft-v1';

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
