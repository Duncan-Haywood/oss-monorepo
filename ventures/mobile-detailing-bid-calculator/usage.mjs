// A browser-level opt-out is an opt-out. Chrome and Firefox send Do Not Track,
// and Global Privacy Control is treated as a valid opt-out signal under CCPA
// and several state privacy laws, so honour both before counting anything.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'bid_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const current = JSON.parse(storage.getItem('mobile-detailing-usage') || '{}');
    current[eventName] = (current[eventName] || 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem('mobile-detailing-usage', JSON.stringify(current));
  } catch { /* A blocked localStorage must not break the calculator. */ }
}
