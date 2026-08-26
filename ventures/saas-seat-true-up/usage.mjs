const KEY = 'saas-seat-true-up:usage';
const OPT_OUT = 'saas-seat-true-up:opt-out';

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

export function recordEvent(eventName) {
  if (!usageAllowed()) return;
  try {
    const ls = storage();
    if (!ls) return;
    const current = JSON.parse(ls.getItem(KEY) || '{}');
    current[eventName] = (current[eventName] || 0) + 1;
    ls.setItem(KEY, JSON.stringify(current));
  } catch { /* Private browsing must not break the calculator. */ }
}

export function disableUsage() {
  try {
    const ls = storage();
    if (!ls) return;
    ls.setItem(OPT_OUT, 'true');
    ls.removeItem(KEY);
  } catch { /* optional measurement */ }
}
