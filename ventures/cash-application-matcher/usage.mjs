// Anonymous, local-only feature counts. Nothing leaves the browser.
const KEY = 'cash-application-usage';
export const DISABLE_KEY = 'cash-application-disable';
export function count(event) {
  try {
    if (localStorage.getItem(DISABLE_KEY) === '1' || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
    let data = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    data[event] = (data[event] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage is optional */
  }
}
export function setEnabled(on) {
  try { if (on) localStorage.removeItem(DISABLE_KEY); else localStorage.setItem(DISABLE_KEY, '1'); } catch { /* optional */ }
}
export function isEnabled() {
  try { return localStorage.getItem(DISABLE_KEY) !== '1'; } catch { return true; }
}
