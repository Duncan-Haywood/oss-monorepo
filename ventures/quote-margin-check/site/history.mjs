const STORAGE_KEY = "quote-margin-check-history-v1";
const MAX_ENTRIES = 10;

function storage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function loadHistory() {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object" && entry.quote && typeof entry.quote === "object").slice(0, MAX_ENTRIES) : [];
  } catch { return []; }
}

export function saveHistory(quote) {
  const entry = { saved_at: new Date().toISOString(), quote: { ...quote } };
  const entries = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  const store = storage();
  if (store) {
    try { store.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* private browsing can deny storage */ }
  }
  return entries;
}

export function clearHistory() {
  const store = storage();
  if (store) {
    try { store.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
  }
  return [];
}
