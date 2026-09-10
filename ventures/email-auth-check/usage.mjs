// Records an anonymous, aggregate-only local usage count: the event name
// and the current day, kept in the visitor's own browser. It never stores
// the domain checked, the DNS records read, or anything about what the
// report said -- that is exactly the kind of thing that must not be
// transmitted anywhere, and this tool never transmits it in the first
// place: nothing here ever leaves the browser at all.

const STORAGE_KEY = 'email-auth-check-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'check_run') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page computing a result.
  }
}
