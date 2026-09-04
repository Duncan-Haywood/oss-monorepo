const STORAGE_PREFIX = 'retainage-cashflow:usage:';
const OPT_OUT_KEY = 'retainage-cashflow:usage-opt-out';

function storageAvailable() {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
}

function browserOptedOut() {
  try { return navigator?.doNotTrack === '1' || navigator?.globalPrivacyControl === true; } catch { return false; }
}

export function isUsageEnabled() {
  if (!storageAvailable() || browserOptedOut()) return false;
  try { return localStorage.getItem(OPT_OUT_KEY) !== '1'; } catch { return false; }
}

export function setUsageEnabled(enabled) {
  if (!storageAvailable()) return;
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, '1');
  } catch { /* Usage is best effort and must not affect the product. */ }
}

export function recordUsage(eventName) {
  if (!isUsageEnabled()) return;
  try {
    const key = `${STORAGE_PREFIX}${eventName}`;
    localStorage.setItem(key, String(Number(localStorage.getItem(key) || 0) + 1));
  } catch { /* Private browsing and full storage are expected failure modes. */ }
}
