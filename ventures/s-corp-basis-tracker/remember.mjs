// Opt-in "remember my entries on this device". Entries are K-1 figures, so
// nothing is stored unless the visitor ticks the box, and the store is only
// the visitor's own localStorage: it is never sent anywhere.
export const REMEMBER_KEY = "s-corp-basis-tracker-entries";

export function packEntries({ opening, years }) {
  return JSON.stringify({ v: 1, opening: opening || {}, years: String(years || "") });
}

// Returns null for anything missing, malformed or from another version.
export function unpackEntries(raw) {
  try {
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || typeof d.years !== "string" || typeof d.opening !== "object" || d.opening === null) return null;
    const opening = {};
    for (const k of ["stock", "debtBasis", "debtFace", "suspended"]) opening[k] = typeof d.opening[k] === "string" ? d.opening[k] : "";
    return { opening, years: d.years };
  } catch {
    return null;
  }
}

// `store` is a localStorage-shaped object; a blocked or full store never throws.
export function saveEntries(store, entries) {
  try { store.setItem(REMEMBER_KEY, packEntries(entries)); return true; } catch { return false; }
}
export function loadEntries(store) {
  try { const raw = store.getItem(REMEMBER_KEY); return raw == null ? null : unpackEntries(raw); } catch { return null; }
}
export function forgetEntries(store) {
  try { store.removeItem(REMEMBER_KEY); return true; } catch { return false; }
}
