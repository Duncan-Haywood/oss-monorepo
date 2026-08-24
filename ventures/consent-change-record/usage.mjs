export function recordUsage(storage, optedOut) {
  if (optedOut || !storage) return;
  try {
    const current = Number(storage.getItem('consent-change-record:comparisons') || 0);
    storage.setItem('consent-change-record:comparisons', String(current + 1));
  } catch { /* Browser storage can be unavailable; the product must still work. */ }
}
