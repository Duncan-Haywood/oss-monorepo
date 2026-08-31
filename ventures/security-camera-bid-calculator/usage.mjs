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
  if (optedOut || !storage || honorsBrowserSignal()) return;
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
