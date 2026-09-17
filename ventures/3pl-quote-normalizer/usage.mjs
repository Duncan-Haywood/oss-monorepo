const KEY = "3pl-quote-normalizer-usage";
// The opt-out lives in its own key, not in the counters: opting out
// *removes* the counters, so a flag kept inside them would be deleted
// by the very act it records. Consulted by `record` below, because a
// stored preference nothing reads is not a preference.
const OPT_OUT = "3pl-quote-normalizer-usage-opt-out";
// A browser-level opt-out is an opt-out. Chrome and Firefox send Do Not Track,
// and Global Privacy Control is treated as a valid opt-out signal under CCPA
// and several state privacy laws, so honour both before counting anything.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

function usageOptedOut() {
  if (globalThis.__usageOptOut) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(OPT_OUT) === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function record(event) {
  if (typeof localStorage === "undefined" || usageOptedOut() || honorsBrowserSignal()) return;
  let current;
  try { current = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { current = {}; }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage is optional */ }
}
export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (typeof localStorage === "undefined") return;
  // Separate try blocks, counters first. Sharing one try means a
  // setItem that throws on a full quota skips the delete entirely,
  // and the visitor gets neither half of what the switch promised.
  if (off) {
    try { localStorage.removeItem(KEY); } catch { /* storage is optional */ }
    try { localStorage.setItem(OPT_OUT, "1"); } catch { /* storage is optional */ }
  } else {
    try { localStorage.removeItem(OPT_OUT); } catch { /* storage is optional */ }
  }
}

/** Whether counting is switched off, including on a later visit. */
export { usageOptedOut };
