// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores an acreage, a location, a customer, an hourly cost, a machine
// payment or any figure the worksheet produces. What a one-machine operation
// pays for fuel, what it owes on the machine, how many hours a month it really
// bills and the margin it quotes at are the commercially sensitive core of that
// business -- the kind of thing the operator bidding against them would pay for
// -- so nothing about a job is written anywhere but the page in front of the
// person typing it.

const STORAGE_KEY = 'forestry-mulching-bid-usage';

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'job_priced') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // A browser refusing site data must not stop the page pricing a job.
  }
}
