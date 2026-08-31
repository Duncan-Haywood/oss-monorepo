// Local-only draft persistence. Quote values never leave this browser.
const STORAGE_KEY = "quote-margin-check:draft";

function storageAvailable() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

export function loadDraft() {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && typeof draft === "object" && !Array.isArray(draft) ? draft : null;
  } catch { return null; }
}

export function saveDraft(draft) {
  if (!storageAvailable()) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); return true; } catch { return false; }
}

export function clearDraft() {
  if (!storageAvailable()) return false;
  try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}
