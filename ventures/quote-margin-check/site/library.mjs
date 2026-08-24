// Browser-only quote library. Records stay in localStorage and are never sent.
const STORAGE_KEY = "quote-margin-check:saved-quotes";
function getStorage() { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } }
function read() { const store = getStorage(); if (!store) return []; try { const value = JSON.parse(store.getItem(STORAGE_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function write(quotes) { const store = getStorage(); if (!store) return false; try { store.setItem(STORAGE_KEY, JSON.stringify(quotes)); return true; } catch { return false; } }
export function listSavedQuotes() { return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export function saveQuote(name, quote) {
  const trimmed = String(name).trim();
  if (!trimmed || trimmed.length > 80) throw new Error("Enter a quote name up to 80 characters.");
  const quotes = read();
  const existing = quotes.find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  const saved = { id: existing?.id || crypto.randomUUID(), name: trimmed, quote: { ...quote }, updatedAt: new Date().toISOString() };
  const next = existing ? quotes.map((item) => item.id === existing.id ? saved : item) : [saved, ...quotes];
  if (!write(next)) throw new Error("This browser cannot save locally. Check storage permissions.");
  return saved;
}
export function deleteSavedQuote(id) { return write(read().filter((item) => item.id !== id)); }
