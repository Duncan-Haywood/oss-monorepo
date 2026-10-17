const KEY = 'mrr-waterfall-calculator-usage-v1';
export function recordUsage(event, optedOut = false) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut()) return;
  if (optedOut || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try {
    const entries = JSON.parse(localStorage.getItem(KEY) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    entries[`${event}:${day}`] = (entries[`${event}:${day}`] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch { /* Calculator remains useful when storage is unavailable. */ }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${KEY}-opt-out`) === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${KEY}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
