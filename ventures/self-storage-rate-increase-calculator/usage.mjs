// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores a rent, a street rate, a unit count, a facility, or any
// figure the calculator produces. What an operator charges, what they are
// about to charge, and how many tenants they think it will cost them are
// competitive facts about a business with named competitors a mile away — so
// nothing about a rate decision is written anywhere but the page in front of
// the person typing it.

const STORAGE_KEY = 'self-storage-rate-increase-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'increase_priced') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page pricing an increase.
  }
}
