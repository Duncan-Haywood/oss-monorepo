export function recordUsage(storage, optedOut, navigatorLike = globalThis.navigator) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optedOut || !storage) return;
  if (navigatorLike && (navigatorLike.doNotTrack === '1' || navigatorLike.globalPrivacyControl)) return;
  try {
    const current = Number(storage.getItem('consent-change-record:comparisons') || 0);
    storage.setItem('consent-change-record:comparisons', String(current + 1));
  } catch { /* Browser storage can be unavailable; the product must still work. */ }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem('consent-change-record:comparisons-opt-out') === '1';
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
    try { storage.removeItem('consent-change-record:comparisons'); } catch { /* storage is optional */ }
    try { storage.setItem('consent-change-record:comparisons-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('consent-change-record:comparisons-opt-out'); } catch { /* storage is optional */ }
  }
}
