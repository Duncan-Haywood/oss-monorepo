const KEY = 'cloud-egress-calculator-usage-v1';

export function recordUsage(event) {
  if (typeof localStorage === 'undefined' || localStorage.getItem(`${KEY}-off`) === '1') return;
  let usage;
  try { usage = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { usage = {}; }
  usage[event] = (usage[event] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(usage));
}

export function setUsageEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${KEY}-off`, enabled ? '0' : '1');
}
