const countsKey = 'vendor-rate-break-even-usage';
const optOutKey = 'vendor-rate-break-even-usage-opt-out';

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

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

export function recordUsage(event) {
  const store = storage();
  if (!store || honorsBrowserSignal() || store.getItem(optOutKey) === 'true') return;
  const counts = JSON.parse(store.getItem(countsKey) || '{}');
  counts[event] = (counts[event] || 0) + 1;
  store.setItem(countsKey, JSON.stringify(counts));
}

export function setUsageOptOut(value) {
  const store = storage();
  if (store) store.setItem(optOutKey, String(Boolean(value)));
}
