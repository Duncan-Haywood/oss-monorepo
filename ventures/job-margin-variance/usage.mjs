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

export function recordUsage(storage, optOut, navigatorLike = globalThis.navigator) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optOut) return;
  if (
    navigatorLike?.doNotTrack === '1' ||
    navigatorLike?.globalPrivacyControl === true ||
    navigatorLike?.globalPrivacyControl === 'true'
  ) {
    return;
  }
  try {
    const key = 'job-margin-variance-usage';
    const current = JSON.parse(storage.getItem(key) || '{}');
    storage.setItem(key, JSON.stringify({
      report_generated: Number(current.report_generated || 0) + 1,
    }));
  } catch { /* blocked storage is a valid privacy choice */ }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem('job-margin-variance-usage-opt-out') === '1';
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
    try { storage.removeItem('job-margin-variance-usage'); } catch { /* storage is optional */ }
    try { storage.setItem('job-margin-variance-usage-opt-out', '1'); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem('job-margin-variance-usage-opt-out'); } catch { /* storage is optional */ }
  }
}
