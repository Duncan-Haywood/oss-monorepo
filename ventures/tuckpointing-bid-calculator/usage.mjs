// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// wall, the wage, the price, or any other bid input, and it never leaves
// the device — a mason's pricing is exactly the sort of thing that must not
// be transmitted anywhere.
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
  const current = JSON.parse(storage.getItem('tuckpointing-bid-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem('tuckpointing-bid-usage', JSON.stringify(current));
}
