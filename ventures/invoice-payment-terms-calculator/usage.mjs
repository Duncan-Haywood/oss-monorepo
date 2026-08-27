const KEY = 'invoice-terms-usage-v1';

export function recordUsage(storage, optedOut, event = 'calculation') {
  if (optedOut || !storage) return;
  try {
    const counts = JSON.parse(storage.getItem(KEY) || '{}');
    counts[event] = (counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing must not break the calculator. */ }
}
