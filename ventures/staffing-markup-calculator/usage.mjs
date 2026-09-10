// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores the pay rate, the markup, the client, the comp code, the
// state, or any figure the calculator produces. An agency's bill rates and
// its burden are the two things it least wants a competitor to see, and this
// tool holds both — so nothing about a placement is written anywhere but the
// page in front of the person typing it.

const STORAGE_KEY = 'staffing-markup-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'placement_priced') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page pricing a placement.
  }
}
