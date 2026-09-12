// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// prices, costs, or any calculator input, and never leaves the device.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'order_profit_calculated') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  // Usage is optional telemetry. A blocked, full, or stale storage value must
  // never make the calculator's input handlers fail.
  try {
    const today = new Date().toISOString().slice(0, 10);
    let current = {};
    try {
      current = JSON.parse(storage.getItem('ebay-fee-usage') || '{}');
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    } catch {
      current = {};
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = today;
    storage.setItem('ebay-fee-usage', JSON.stringify(current));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
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
    return storage?.getItem('ebay-fee-usage-opt-out') === '1';
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
    try { storage.removeItem('ebay-fee-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('ebay-fee-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('ebay-fee-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
