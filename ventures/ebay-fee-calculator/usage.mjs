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
  if (optedOut || !storage || honorsBrowserSignal()) return;
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
