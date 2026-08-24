const KEY = 'saas-seat-true-up-usage';

export function recordUsage(storage, event, optedOut = false) {
  if (optedOut || !storage) return;
  try {
    const current = JSON.parse(storage.getItem(KEY) || '{}');
    current[event] = Math.min(10000, Number(current[event] || 0) + 1);
    storage.setItem(KEY, JSON.stringify(current));
  } catch { /* local storage is optional */ }
}
