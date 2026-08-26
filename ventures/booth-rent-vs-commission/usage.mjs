// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// ticket, the book, the rent, or any other compensation input, and it never
// leaves the device — a stylist's take-home is exactly the sort of thing that
// must not be transmitted anywhere.

const STORAGE_KEY = 'booth-rent-vs-commission-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'comparison_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem(STORAGE_KEY, JSON.stringify(current));
}
