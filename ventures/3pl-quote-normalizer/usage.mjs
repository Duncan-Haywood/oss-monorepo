const KEY = "3pl-quote-normalizer-usage";
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

export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut || honorsBrowserSignal()) return;
  let current;
  try { current = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { current = {}; }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage is optional */ }
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
