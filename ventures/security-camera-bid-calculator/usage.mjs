// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// site, the camera count, the wage, the price, or any other bid input, and it
// never leaves the device — an installer's pricing, and the layout of a
// customer's camera system, are exactly the sort of thing that must not be
// transmitted anywhere.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'bid_calculated') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  // A storage failure must never break the calculator. Private-mode browsers
  // and disabled site data both throw here, and a usage count is not worth a
  // dead page — this is best-effort by design.
  try {
    const current = JSON.parse(storage.getItem('security-camera-bid-usage') || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem('security-camera-bid-usage', JSON.stringify(current));
  } catch {
    /* ignore */
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
    return storage?.getItem('security-camera-bid-usage-opt-out') === '1';
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
    try { storage.removeItem('security-camera-bid-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('security-camera-bid-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('security-camera-bid-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
