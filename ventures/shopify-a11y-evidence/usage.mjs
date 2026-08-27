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

export function recordUsage(storage = globalThis.localStorage, optOut = false, event = 'report_generated') {
  if (optOut || !storage || honorsBrowserSignal()) return;
  const key = 'shopify-a11y-evidence-usage';
  let current = {};
  try { current = JSON.parse(storage.getItem(key) || '{}'); } catch { current = {}; }
  current[event] = Number(current[event] || 0) + 1;
  storage.setItem(key, JSON.stringify(current));
}
