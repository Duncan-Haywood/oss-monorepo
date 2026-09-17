const KEY = "actions-transitive-pin-check-usage";
// Separate from the counters on purpose: opting out *removes* the
// counters, so a flag stored inside them would be deleted by the very
// act it records.
const OPT_OUT = "actions-transitive-pin-check-usage-opt-out";

function usageOptedOut() {
  if (globalThis.__usageOptOut) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(OPT_OUT) === "1";
  } catch {
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

export function record(event) {
  if (typeof localStorage === "undefined" || usageBlocked()) return;
  let current;
  try {
    current = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    current = {};
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function readUsage() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (typeof localStorage === "undefined") return;
  if (off) {
    try { localStorage.removeItem(KEY); } catch { /* storage is optional */ }
    try { localStorage.setItem(OPT_OUT, "1"); } catch { /* storage is optional */ }
  } else {
    try { localStorage.removeItem(OPT_OUT); } catch { /* storage is optional */ }
  }
}

export { usageOptedOut };
