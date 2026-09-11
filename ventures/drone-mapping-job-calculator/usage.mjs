// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser.
//
// It never stores a site area, a coordinate, a client, an altitude, a rate or
// any figure the worksheet produces. A pilot's acreage, their hourly rate and
// the margin they quote at are the commercially sensitive core of a small
// operation — the kind of thing a competitor would pay for — so nothing about
// a job is written anywhere but the page in front of the person typing it.

const STORAGE_KEY = 'drone-mapping-job-usage';

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
