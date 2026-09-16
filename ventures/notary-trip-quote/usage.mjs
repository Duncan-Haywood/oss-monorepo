const KEY = 'notary-trip-quote-usage';
// The key this venture has always stored the choice under, and which the
// recorder below has always honoured. The page-facing pair reads and writes
// this one -- see the note on readOptOut.
const OPT_OUT = 'notary-trip-quote-optout';
export function recordUsage(event) {
  if (typeof window === 'undefined' || !event || navigator.doNotTrack === '1' || navigator.globalPrivacyControl || localStorage.getItem(OPT_OUT) === '1') return;
  try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); const day = new Date().toISOString().slice(0, 10); data[day] = data[day] || {}; data[day][event] = (data[day][event] || 0) + 1; localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* Storage is optional. */ }
}

// The page-facing pair, over OPT_OUT -- the key the recorder already reads.
// The first draft invented `${KEY}-opt-out` beside it and left the page's
// original one-way listener in place, so the two went out of phase: the old
// listener could only ever set the flag, the new one toggled a different
// flag, and on the second click the button announced counting was back on
// while `recordUsage` was still returning at the old key. The page's listener
// is gone; this is the only writer now.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(OPT_OUT) === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(KEY); } catch { /* storage is optional */ }
    try { storage.setItem(OPT_OUT, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(OPT_OUT); } catch { /* storage is optional */ }
  }
}
