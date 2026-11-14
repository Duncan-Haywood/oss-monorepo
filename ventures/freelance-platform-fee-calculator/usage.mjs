// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores a job
// price, a fee percentage, or any other figure typed in, and it never leaves
// the device -- a freelancer's rates and earnings are exactly the sort of
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

export function recordUsage(storage = usageStorage(), optedOut = false, event = 'comparison_calculated') {
  try {
    if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem('freelance-platform-fee-usage') || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem('freelance-platform-fee-usage', JSON.stringify(current));
  } catch {
    // A full or blocked store, or a corrupt counter, must never break the page.
  }
}

// The opt-out choice is kept in its own key, not in the counters: opting out
// *removes* the counters, so a flag stored inside them would be deleted by
// the very act it records.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem('freelance-platform-fee-usage-opt-out') === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = usageStorage(), optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the visitor
  // gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem('freelance-platform-fee-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('freelance-platform-fee-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('freelance-platform-fee-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
