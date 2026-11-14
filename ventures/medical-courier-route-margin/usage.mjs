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

export function createUsage(storage = usageStorage()) {
  const disabled = () => globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  return { record(event) { if (disabled()) return; try { const key = 'medical-courier-route-margin-usage'; const data = JSON.parse(storage.getItem(key) || '{}'); data[event] = (data[event] || 0) + 1; storage.setItem(key, JSON.stringify(data)); } catch {} } };
}
