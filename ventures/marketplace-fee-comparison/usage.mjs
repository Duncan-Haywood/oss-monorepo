// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores prices,
// costs, fee rates, or any other calculator input, and never leaves the device.
//
// Same shape as the sibling calculators' counters, under its own storage key so
// the products' counts stay separable.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'channels_compared') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('marketplace-fee-comparison-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem('marketplace-fee-comparison-usage', JSON.stringify(current));
}
