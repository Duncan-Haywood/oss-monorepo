// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// lot, the stall count, the wage, the price, or any other bid input, and it
// never leaves the device — a contractor's pricing is exactly the sort of
// thing that must not be transmitted anywhere.
// Reading the `localStorage` global throws SecurityError when the visitor
// blocks site data (Chrome's "block all cookies", Safari with cookies
// blocked), and a default parameter is evaluated before any try in the body.
// So the defaults below, and the page's calls, go through this instead of
// naming the global: a blocked store reads as "no storage", never a crash.
export function usageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = usageStorage(), optedOut = false, event = 'bid_calculated') {
  try {
    if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem('parking-lot-striping-bid-usage') || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem('parking-lot-striping-bid-usage', JSON.stringify(current));
  } catch {
    // A full or blocked store, or a corrupt counter, must never break the page.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. `recordUsage` above consults it
// directly as well as taking the caller's argument -- a stored preference
// that only one line of page wiring reads is one line away from being
// forgotten, which is the defect this change exists to fix.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem('parking-lot-striping-bid-usage-opt-out') === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = usageStorage(), optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem('parking-lot-striping-bid-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('parking-lot-striping-bid-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('parking-lot-striping-bid-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
