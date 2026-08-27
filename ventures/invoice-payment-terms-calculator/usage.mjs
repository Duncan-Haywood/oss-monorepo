const KEY = 'invoice-terms-usage-v1';

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

export function recordUsage(storage, optedOut, event = 'calculation') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const counts = JSON.parse(storage.getItem(KEY) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing must not break the calculator. */ }
}
