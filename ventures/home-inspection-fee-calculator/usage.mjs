// Anonymous, local-only feature-event counting. Copied from the pattern used
// across this portfolio (see e.g. ventures/locksmith-bid-calculator/usage.mjs)
// rather than reinvented: no PII, no IPs, no content, never transmitted, and
// off automatically when the browser sends Do Not Track or Global Privacy
// Control. See portfolio/usage/README.md.
const KEY = 'home-inspection-fee-calculator-usage';
const OPT_OUT = 'home-inspection-fee-calculator-usage-opt-out';

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

export function recordEvent(event = 'quote-priced') {
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
