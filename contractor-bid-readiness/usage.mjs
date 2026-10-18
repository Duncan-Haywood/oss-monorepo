const KEY = 'contractor-bid-readiness-usage';

function trackingDenied() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(event, enabled = true) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut()) return;
  if (!enabled || trackingDenied()) return;
  // Usage is optional telemetry, called as the last statement of each click
  // handler in index.html with no try/catch around it there. A blocked, full,
  // or corrupted storage value must never throw out of this call -- an
  // uncaught error here would surface as a broken button even though the
  // readiness check (or the report download) it follows already succeeded.
  try {
    let counts = {};
    try {
      counts = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};
    } catch {
      counts = {};
    }
    counts[event] = (Number.isFinite(counts[event]) ? counts[event] : 0) + 1;
    globalThis.localStorage?.setItem(KEY, JSON.stringify(counts));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${KEY}-opt-out`) === '1';
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
    try { storage.removeItem(KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${KEY}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
