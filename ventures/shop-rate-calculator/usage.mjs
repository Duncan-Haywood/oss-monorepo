// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the wage,
// the payroll costs, the overhead figures, or the resulting rates — a shop's
// cost structure is exactly the sort of thing that must not be transmitted
// anywhere, and this tool holds more of it than any calculator on the site.

const STORAGE_KEY = 'shop-rate-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'rate_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page computing a rate.
  }
}
