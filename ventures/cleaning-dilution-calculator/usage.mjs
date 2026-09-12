function privacySignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optedOut || !storage || privacySignal()) return;
  // Usage is optional telemetry. A blocked, full, or corrupted storage value
  // must never throw out of this call: it runs from inside the same debounced
  // callback that shows the calculated result, and an uncaught error here has
  // nothing to do with whether the dilution numbers on screen are right.
  try {
    const key = 'cleaning-dilution-usage';
    let current = {};
    try {
      current = JSON.parse(storage.getItem(key) || '{}');
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    } catch {
      current = {};
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem(key, JSON.stringify(current));
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
    return storage?.getItem(`${key}-opt-out`) === '1';
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
    try { storage.removeItem(key); } catch { /* storage is optional */ }
    try { storage.setItem(`${key}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${key}-opt-out`); } catch { /* storage is optional */ }
  }
}
