// Local-first, aggregate-only usage counting, per portfolio/usage/usage.yaml:
// count events, never people. No snapshot text, no URLs, no file names — just
// an event name and a day, kept in this browser's own localStorage. Nothing
// is sent anywhere; there is no server for it to go to. Off-switchable, and
// honors Do Not Track / Global Privacy Control.

const STORAGE_KEY = "vendor-change-evidence:usage";
const OPT_OUT_KEY = "vendor-change-evidence:usage:off";

function hasStorage() {
  try { return typeof localStorage !== "undefined"; } catch { return false; }
}

function browserOptedOut() {
  try {
    return navigator?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

function isUsageEnabled() {
  if (!hasStorage() || browserOptedOut()) return false;
  try { return localStorage.getItem(OPT_OUT_KEY) !== "1"; } catch { return false; }
}

function setUsageEnabled(enabled) {
  if (!hasStorage()) return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "1");
  } catch { /* usage must never affect the report */ }
}

function recordUsage(eventName) {
  if (!isUsageEnabled() || !eventName) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const key = `${eventName}:${day}`;
    events[key] = (events[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch { /* private browsing and full storage are expected */ }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isUsageEnabled, setUsageEnabled, recordUsage, STORAGE_KEY, OPT_OUT_KEY };
}
