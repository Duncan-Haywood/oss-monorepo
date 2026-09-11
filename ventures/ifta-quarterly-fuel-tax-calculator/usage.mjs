// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores a mileage, a gallon figure, a tax rate, a jurisdiction, or
// any figure the worksheet produces. Where a carrier runs, how much it burns
// and what it is about to file are the substance of a tax return and a map of
// the business's lanes — so nothing about a quarter is written anywhere but
// the page in front of the person typing it.

const STORAGE_KEY = 'ifta-quarterly-fuel-tax-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'return_worked') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page working a return.
  }
}
