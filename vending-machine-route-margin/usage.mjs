const KEY = 'vending-machine-route-margin-usage';
const OPT_OUT = 'vending-machine-route-margin-usage-opt-out';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function usageAllowed() {
  if (typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || navigator.globalPrivacyControl)) {
    return false;
  }
  const ls = storage();
  if (!ls) return false;
  return ls.getItem(OPT_OUT) !== 'true';
}

export function recordEvent(event = 'visit-priced') {
  if (!usageAllowed()) return;
  try {
    const ls = storage();
    if (!ls) return;
    const counts = JSON.parse(ls.getItem(KEY) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    ls.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing must not break the calculator. */ }
}

export function toggleUsage(enabled) {
  try {
    const ls = storage();
    if (!ls) return;
    ls.setItem(OPT_OUT, enabled ? 'false' : 'true');
  } catch { /* optional measurement */ }
}
