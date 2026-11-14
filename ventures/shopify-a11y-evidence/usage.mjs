// A browser-level opt-out is an opt-out. Chrome and Firefox send Do Not Track,
// and Global Privacy Control is treated as a valid opt-out signal under CCPA
// and several state privacy laws, so honour both before counting anything.
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

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = usageStorage(), optOut = false, event = 'report_generated') {
  try {
    if (optOut || !storage || honorsBrowserSignal()) return;
    const key = 'shopify-a11y-evidence-usage';
    let current = {};
    try { current = JSON.parse(storage.getItem(key) || '{}'); } catch { current = {}; }
    current[event] = Number(current[event] || 0) + 1;
    storage.setItem(key, JSON.stringify(current));
  } catch {
    // A full or blocked store, or a corrupt counter, must never break the page.
  }
}
