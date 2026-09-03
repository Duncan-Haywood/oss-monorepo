export function recordUsage(storage, optedOut, navigatorLike = globalThis.navigator) {
  if (optedOut || !storage) return;
  if (navigatorLike && (navigatorLike.doNotTrack === '1' || navigatorLike.globalPrivacyControl)) return;
  try {
    const current = Number(storage.getItem('consent-change-record:comparisons') || 0);
    storage.setItem('consent-change-record:comparisons', String(current + 1));
  } catch { /* Browser storage can be unavailable; the product must still work. */ }
}
