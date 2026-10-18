// Aggregate, local-only feature counting.
//
// Same shape as the other tools in this portfolio: event names and counts in
// this browser's local storage, never branch names, repository names, commit
// ids, or anything else out of a snapshot. Nothing is uploaded and there is no
// analytics vendor — the counts exist so the portfolio can tell a tool people
// use from one they only land on, and they are deletable from the page itself.

const KEY = 'repository-branch-hygiene-usage';
// Separate from the counters on purpose: opting out *removes* the
// counters, so a flag stored inside them would be deleted by the very
// act it records.
const OPT_OUT = 'repository-branch-hygiene-usage-opt-out';

// The in-memory flag is only a same-page fast path. `globalThis` is a
// fresh realm on every page load, so without the stored key the switch
// silently stops working on the visitor's next visit -- and they do not
// look again, because they believe they already used it.
function usageOptedOut() {
  if (globalThis.__usageOptOut) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(OPT_OUT) === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

function usageBlocked() {
  if (usageOptedOut()) return true;
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return true;
  } catch {
    /* navigator is optional in tests */
  }
  return false;
}

export function record(event) {
  if (typeof localStorage === 'undefined' || usageBlocked()) return;
  let current;
  try {
    current = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    current = {};
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function setUsageOptOut(value) {
  const off = Boolean(value);
  globalThis.__usageOptOut = off;
  if (typeof localStorage === 'undefined') return;
  if (off) {
    try { localStorage.removeItem(KEY); } catch { /* storage is optional */ }
    try { localStorage.setItem(OPT_OUT, '1'); } catch { /* storage is optional */ }
  } else {
    try { localStorage.removeItem(OPT_OUT); } catch { /* storage is optional */ }
  }
}

export { usageOptedOut };
