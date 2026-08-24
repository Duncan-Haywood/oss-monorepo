// Local-only saved quote snapshots. Quote values and names stay in this
// browser's localStorage; usage.mjs is used separately for aggregate events.

const STORAGE_KEY = "quote-margin-check:saved-quotes";
const MAX_SNAPSHOTS = 25;

function storageAvailable() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

function read() {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch { return []; }
}

function write(snapshots) {
  if (!storageAvailable()) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots)); return true; } catch { return false; }
}

export function listSavedQuotes() {
  return read().sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
}

export function saveQuote(name, quote) {
  if (typeof name !== "string" || !name.trim()) throw new Error("Give this quote a name first.");
  const trimmedName = name.trim().slice(0, 80);
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    quote: { ...quote },
    saved_at: new Date().toISOString(),
  };
  const snapshots = [snapshot, ...read().filter((item) => item.name !== trimmedName)].slice(0, MAX_SNAPSHOTS);
  if (!write(snapshots)) throw new Error("This browser could not save the quote locally.");
  return snapshot;
}

export function deleteQuote(id) {
  const snapshots = read();
  const remaining = snapshots.filter((item) => item.id !== id);
  if (remaining.length === snapshots.length) return false;
  return write(remaining);
}

export function clearSavedQuotes() { return write([]); }
