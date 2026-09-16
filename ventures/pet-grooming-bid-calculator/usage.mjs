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

export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'bid_calculated') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const current = JSON.parse(storage.getItem('pet-grooming-usage') || '{}');
    current[eventName] = (current[eventName] || 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem('pet-grooming-usage', JSON.stringify(current));
  } catch { /* A blocked localStorage must not break the calculator. */ }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. `recordUsage` above consults it
// directly as well as taking the caller's argument -- a stored preference
// that only one line of page wiring reads is one line away from being
// forgotten, which is the defect this change exists to fix.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem('pet-grooming-usage-opt-out') === '1';
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
    try { storage.removeItem('pet-grooming-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('pet-grooming-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('pet-grooming-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
