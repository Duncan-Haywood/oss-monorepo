// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores a job
// price, a fee percentage, or any other figure typed in, and it never leaves
// the device -- a freelancer's rates and earnings are exactly the sort of
// thing that must not be transmitted anywhere.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'comparison_calculated') {
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('freelance-platform-fee-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem('freelance-platform-fee-usage', JSON.stringify(current));
}

// The opt-out choice is kept in its own key, not in the counters: opting out
// *removes* the counters, so a flag stored inside them would be deleted by
// the very act it records.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem('freelance-platform-fee-usage-opt-out') === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
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
