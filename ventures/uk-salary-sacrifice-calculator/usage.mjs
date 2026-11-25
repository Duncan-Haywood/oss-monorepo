const KEY = "uk-salary-sacrifice-calculator-usage";
// Separate from the counters on purpose: opting out *removes* the
// counters, so a flag stored inside them would be deleted by the very
// act it records.
const OPT_OUT = "uk-salary-sacrifice-calculator-usage-opt-out";

// Reading the `localStorage` global itself throws SecurityError when the
// visitor blocks site data, so even `typeof localStorage` needs a guard.
function noStorage() {
  try {
    return typeof localStorage === "undefined";
  } catch {
    return true;
  }
}

// The in-memory flag is only a same-page fast path. `globalThis` is a
// fresh realm on every page load, so without the stored key the switch
// silently stops working on the visitor's next visit -- and they do not
// look again, because they believe they already used it.
function usageOptedOut() {
  if (globalThis.__usageOptOut) return true;
  try {
    return !noStorage() && localStorage.getItem(OPT_OUT) === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

function usageBlocked() {
  if (usageOptedOut()) return true;
  try {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return true;
  } catch {
    /* navigator is optional in tests */
  }
  return false;
}

// What is stored under KEY: a whole-number count per event name, nothing
// else. The event names are fixed strings in this venture's own pages
// (record("example_loaded")), never anything a visitor typed, so no personal
// data, token or password can reach storage through this file; only the
// slug in the key's name sounds sensitive. countsOnly() rebuilds the counter
// from what was read back, keeping each value only as a clamped whole number,
// so text or objects written under the key by anything else are dropped
// rather than written out again.
function countsOnly(value) {
  const counts = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return counts;
  for (const name of Object.keys(value)) {
    const n = Math.min(Math.max(Math.floor(Number(value[name])) || 0, 0), Number.MAX_SAFE_INTEGER);
    if (n > 0) counts[name] = n;
  }
  return counts;
}

function storedCounts() {
  try {
    return countsOnly(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return {};
  }
}

export function record(event) {
  if (noStorage() || usageBlocked()) return;
  const current = storedCounts();
  current[event] = (current[event] || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function readUsage() {
  if (noStorage()) return {};
  return storedCounts();
}

export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (noStorage()) return;
  if (off) {
    try { localStorage.removeItem(KEY); } catch { /* storage is optional */ }
    try { localStorage.setItem(OPT_OUT, "1"); } catch { /* storage is optional */ }
  } else {
    try { localStorage.removeItem(OPT_OUT); } catch { /* storage is optional */ }
  }
}

export { usageOptedOut };
