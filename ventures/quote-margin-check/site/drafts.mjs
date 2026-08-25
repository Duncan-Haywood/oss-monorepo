const STORAGE_KEY = "quote-margin-check:draft";

function getStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(quote, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ version: 1, quote }));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  const target = getStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft?.version === 1 && draft.quote && typeof draft.quote === "object"
      ? draft.quote
      : null;
  } catch {
    return null;
  }
}

export function clearDraft(storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
