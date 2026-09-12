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
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut()) return;
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

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${countsKey}-opt-out`) === '1';
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
    try { storage.setItem(`${countsKey}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${countsKey}-opt-out`); } catch { /* storage is optional */ }
  }
}
