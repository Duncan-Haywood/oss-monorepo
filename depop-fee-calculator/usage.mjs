// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores an
// item price, a cost, or a payout -- a seller's item economics are exactly
// the sort of thing that must not be transmitted anywhere.

const STORAGE_KEY = 'depop-fee-calculator-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'sale_calculated') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page computing a result.
  }
}

// The opt-out choice is kept in its own key, not in the counters: opting out
// *removes* the counters, so a flag stored inside them would be deleted by
// the very act it records. `recordUsage` above consults it directly as well
// as taking the caller's argument.
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
  // Independent writes, counters first: sharing one try means a setItem that
  // throws on a full quota skips the delete entirely, and the visitor gets
  // neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(STORAGE_KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${STORAGE_KEY}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${STORAGE_KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
