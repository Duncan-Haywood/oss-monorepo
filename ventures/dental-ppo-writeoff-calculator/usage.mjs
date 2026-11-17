// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores a plan
// name, a production figure, a write-off, a payroll total or anything the
// calculator derives from them. What a practice produces, what it pays its
// providers, and which carriers it participates with are competitively
// sensitive, and none of it leaves the device.

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

const STORAGE_KEY = 'dental-ppo-writeoff-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = usageStorage(), optedOut = false, event = 'rate_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page computing a rate.
  }
}

export { STORAGE_KEY };
