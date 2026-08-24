const KEY = 'pool-route-pricing-usage';
const OPT_OUT = 'pool-route-pricing-usage-opt-out';

export function recordEvent(event = 'estimate') {
  try {
    if (localStorage.getItem(OPT_OUT) === 'true') return;
    const counts = JSON.parse(localStorage.getItem(KEY) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing must not break the calculator. */ }
}

export function toggleUsage(enabled) {
  try { localStorage.setItem(OPT_OUT, enabled ? 'false' : 'true'); } catch { /* optional measurement */ }
}
