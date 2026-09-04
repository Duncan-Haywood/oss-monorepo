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
  if (!store || honorsBrowserSignal()) return;
  // Usage is optional telemetry called straight out of click handlers (and
  // once at page load) in index.html, with no surrounding try/catch there.
  // Blocked storage (private browsing, quota) or corrupted JSON must never
  // throw out of this call -- an uncaught error here would break the click
  // handler after the real work (adding a scenario, saving a draft) already
  // happened, silently dropping the "Saved" feedback the user is waiting on.
  try {
    if (store.getItem(optOutKey) === 'true') return;
    let counts = {};
    try {
      counts = JSON.parse(store.getItem(countsKey) || '{}');
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};
    } catch {
      counts = {};
    }
    counts[event] = (Number.isFinite(counts[event]) ? counts[event] : 0) + 1;
    store.setItem(countsKey, JSON.stringify(counts));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}

export function setUsageOptOut(value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(optOutKey, String(Boolean(value)));
  } catch {
    // Optional persistence; opting out should never throw.
  }
}
