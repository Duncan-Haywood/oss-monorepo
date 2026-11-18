// Reading the `localStorage` global throws SecurityError when the visitor
// blocks site data (Chrome's "block all cookies", Safari with cookies
// blocked), and a default parameter is evaluated before any try in the body.
// So the defaults below, and the page's calls, go through this instead of
// naming the global: a blocked store reads as "no storage", never a crash.
export function usageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = usageStorage(), optedOut = false, eventName = 'landed_cost_calculated') {
  try {
    if (optedOut || !storage || honorsBrowserSignal()) return;
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem('import-landed-cost-usage') || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    current[eventName] = (current[eventName] || 0) + 1;
    current.last_day = today;
    storage.setItem('import-landed-cost-usage', JSON.stringify(current));
  } catch {
    // A full or blocked store, or a corrupt counter, must never break the page.
  }
}
