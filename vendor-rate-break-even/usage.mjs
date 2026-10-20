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

// The page-facing pair. `${countsKey}-opt-out` spells the same string as
// optOutKey, so the first draft did not invent a second key here -- it
// invented a second *encoding*. `setUsageOptOut` has always stored
// `String(Boolean(value))`, so an existing opt-out reads `"true"`, and a
// reader accepting only `"1"` painted the control unchecked for exactly the
// visitors who had already chosen: counting correctly off, and the control
// saying their choice had been forgotten. One key, one encoding, and
// `setUsageOptOut` remains the thing that defines it.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(optOutKey) === 'true';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(countsKey); } catch { /* storage is optional */ }
    try { storage.setItem(optOutKey, 'true'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(optOutKey); } catch { /* storage is optional */ }
  }
}
