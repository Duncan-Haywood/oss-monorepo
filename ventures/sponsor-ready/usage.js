const STORAGE_KEY = 'sponsor-ready:usage';
const OPT_OUT_KEY = 'sponsor-ready:usage:off';

function hasStorage() {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
}

function browserOptedOut() {
  try {
    return navigator?.doNotTrack === '1' || navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

function isUsageEnabled() {
  if (!hasStorage() || browserOptedOut()) return false;
  try { return localStorage.getItem(OPT_OUT_KEY) !== '1'; } catch { return false; }
}

function setUsageEnabled(enabled) {
  if (!hasStorage()) return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, '1');
  } catch { /* usage must never affect the checklist */ }
}

function recordUsage(eventName) {
  if (!isUsageEnabled() || !eventName) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const key = `${eventName}:${day}`;
    events[key] = (events[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch { /* Private browsing and full storage are expected. */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isUsageEnabled, setUsageEnabled, recordUsage, STORAGE_KEY, OPT_OUT_KEY };
}
