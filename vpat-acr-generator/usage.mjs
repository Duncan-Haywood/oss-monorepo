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
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optOut || !storage || honorsBrowserSignal()) return;
  const key = 'vpat-acr-generator-usage';
  let current = {};
  try { current = JSON.parse(storage.getItem(key) || '{}'); } catch { current = {}; }
  current[event] = Number(current[event] || 0) + 1;
  storage.setItem(key, JSON.stringify(current));
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem('vpat-acr-generator-usage-opt-out') === '1';
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
    try { storage.removeItem('vpat-acr-generator-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('vpat-acr-generator-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('vpat-acr-generator-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
