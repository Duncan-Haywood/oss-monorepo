// Local-only draft persistence. Quote values never leave the browser.

const STORAGE_KEY = "quote-margin-check:current-draft";

function storageAvailable() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function saveDraft(quote) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quote));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasDraft() {
  return loadDraft() !== null;
}
