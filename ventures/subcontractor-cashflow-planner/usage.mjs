// Reading the `localStorage` global throws SecurityError when the visitor
// blocks site data (Chrome's "block all cookies", Safari with cookies
// blocked), and a default parameter is evaluated before any try in the body.
// So the defaults below, and the page's calls, go through this instead of
// naming the global: a blocked store reads as "no storage", never a crash.
export function usageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const KEY = 'subcontractor-cashflow-planner-usage';
const EVENTS = new Set(['scenario_planned', 'csv_exported', 'share_link_copied', 'shared_scenario_opened']);

function honorsPrivacy() {
  return globalThis.navigator?.doNotTrack === '1'
    || globalThis.navigator?.globalPrivacyControl === true;
}

export function recordUsage(event, enabled = true, storage = usageStorage()) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (!enabled || !EVENTS.has(event) || honorsPrivacy() || !storage) return;
  try {
    let usage = JSON.parse(storage.getItem(KEY) || '{}');
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)) usage = {};
    usage[event] = (usage[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // localStorage can throw in private mode; counting is optional.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem(`${KEY}-opt-out`) === '1';
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = usageStorage(), optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${KEY}-opt-out`, '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
