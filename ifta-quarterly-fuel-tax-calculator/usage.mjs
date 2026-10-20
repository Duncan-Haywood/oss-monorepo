// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores a mileage, a gallon figure, a tax rate, a jurisdiction, or
// any figure the worksheet produces. Where a carrier runs, how much it burns
// and what it is about to file are the substance of a tax return and a map of
// the business's lanes — so nothing about a quarter is written anywhere but
// the page in front of the person typing it.

const STORAGE_KEY = 'ifta-quarterly-fuel-tax-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'return_worked') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page working a return.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. `recordUsage` above consults it
// directly as well as taking the caller's argument -- a stored preference
// that only one line of page wiring reads is one line away from being
// forgotten, which is the defect this change exists to fix.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${STORAGE_KEY}-opt-out`) === '1';
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
    try { storage.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${STORAGE_KEY}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${STORAGE_KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
