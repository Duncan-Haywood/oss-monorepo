const KEY = '3d-print-price-calculator-usage';
const OPT_OUT = '3d-print-price-calculator-usage-opt-out';

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
  // recordEvent() calls this outside its own try/catch, and the page calls
  // recordEvent() inside the try that renders the result: a getItem that throws
  // (storage blocked or corrupted) must not replace the answer with an error.
  try {
    return ls.getItem(OPT_OUT) !== 'true';
  } catch {
    return false;
  }
}

export function recordEvent(event = 'price-calculated') {
  if (!usageAllowed()) return;
  try {
    const ls = storage();
    if (!ls) return;
    let counts = JSON.parse(ls.getItem(KEY) || '{}');
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};
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
