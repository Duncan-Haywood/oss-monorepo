const KEY = 'invoice-terms-usage-v1';

// A browser-level opt-out is an opt-out. Chrome and Firefox send Do Not Track,
// and Global Privacy Control is treated as a valid opt-out signal under CCPA
// and several state privacy laws, so honour both before counting anything.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage, optedOut, event = 'calculation') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const counts = JSON.parse(storage.getItem(KEY) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing must not break the calculator. */ }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. `recordUsage` above consults it
// directly as well as taking the caller's argument -- a stored preference
// that only one line of page wiring reads is one line away from being
// forgotten, which is the defect this change exists to fix.
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
