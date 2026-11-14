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

export function recordUsage(storage = usageStorage(), optedOut = false, event = 'plan_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  // Usage is optional telemetry. This call sits inside the same try block that
  // renders the priced plan (calculate() in index.html), so a blocked, full,
  // or corrupted storage value must never throw here -- otherwise the outer
  // catch would show the storage error in the warning banner as if the price
  // itself were wrong, even though it computed and rendered correctly.
  try {
    const current0 = storage.getItem('hvac-maintenance-usage');
    let current = {};
    try {
      current = JSON.parse(current0 || '{}');
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    } catch {
      current = {};
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem('hvac-maintenance-usage', JSON.stringify(current));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}
