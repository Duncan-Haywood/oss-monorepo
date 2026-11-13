const KEY = 'benford-audit-usage';
const OFF = 'benford-audit-disable';

export function enabled() {
  try {
    return localStorage.getItem(OFF) !== '1' && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1';
  } catch {
    return false;
  }
}

export function setEnabled(on) {
  try {
    if (on) localStorage.removeItem(OFF);
    else localStorage.setItem(OFF, '1');
  } catch {
    /* storage is optional */
  }
}

/** Count an event name locally. Never records amounts, names or file contents. */
export function count(event) {
  try {
    if (!enabled()) return;
    let data = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    data[event] = (data[event] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage is optional */
  }
}
