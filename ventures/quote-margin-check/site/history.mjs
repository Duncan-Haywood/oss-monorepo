// Quote history stays in the visitor's browser. It contains the user's own
// inputs and derived report, never a network payload or an identifier.

const STORAGE_KEY = "quote-margin-check:quote-history";
const MAX_ENTRIES = 20;

function storageAvailable() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

export function readHistory() {
  if (!storageAvailable()) return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function saveHistoryEntry(label, quote, report, now = new Date()) {
  if (!storageAvailable()) return false;
  const entry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    label: String(label || "Untitled quote").trim().slice(0, 80) || "Untitled quote",
    saved_at: now.toISOString(),
    quote,
    report,
  };
  try {
    const history = [entry, ...readHistory()].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch { return false; }
}

export function clearHistory() {
  if (!storageAvailable()) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
}

export { MAX_ENTRIES };
