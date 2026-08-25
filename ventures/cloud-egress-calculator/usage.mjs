const KEY = 'cloud-egress-calculator-usage-v1';

export function recordUsage(event) {
  if (typeof localStorage === 'undefined' || localStorage.getItem(`${KEY}-off`) === '1') return;
  try {
    let usage;
    try { usage = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { usage = {}; }
    usage[event] = (usage[event] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // Private browsing and full storage must never block the calculator.
  }
}

export function setUsageEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(`${KEY}-off`, enabled ? '0' : '1'); } catch {}
}

export function isUsageEnabled() {
  if (typeof localStorage === 'undefined') return true;
  try { return localStorage.getItem(`${KEY}-off`) !== '1'; } catch { return true; }
}
