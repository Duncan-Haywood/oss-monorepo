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

export function recordUsage(storage = globalThis.localStorage, optedOut = false) {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('ebay-fee-usage') || '{}');
  current.order_profit_calculated = (current.order_profit_calculated || 0) + 1;
  current.last_day = today;
  storage.setItem('ebay-fee-usage', JSON.stringify(current));
}
