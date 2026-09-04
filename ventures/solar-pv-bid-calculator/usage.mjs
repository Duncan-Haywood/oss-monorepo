// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// system size, wages, costs, or prices, and it never leaves the device — an
// installer's bid is exactly the sort of thing that must not be transmitted.
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
  const current = JSON.parse(storage.getItem('solar-pv-bid-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem('solar-pv-bid-usage', JSON.stringify(current));
}
