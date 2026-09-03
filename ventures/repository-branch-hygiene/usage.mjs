// Aggregate, local-only feature counting.
//
// Same shape as the other tools in this portfolio: event names and counts in
// this browser's local storage, never branch names, repository names, commit
// ids, or anything else out of a snapshot. Nothing is uploaded and there is no
// analytics vendor — the counts exist so the portfolio can tell a tool people
// use from one they only land on, and they are deletable from the page itself.

const KEY = 'repository-branch-hygiene-usage';

function usageBlocked() {
  if (globalThis.__usageOptOut) return true;
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
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
