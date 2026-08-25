export function recordUsage(storage, optedOut, event = 'quote_calculated') {
  if (optedOut || !storage) return;
  try {
    const key = 'appliance-repair-usage';
    const current = JSON.parse(storage.getItem(key) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    current[`${day}:${event}`] = (current[`${day}:${event}`] || 0) + 1;
    storage.setItem(key, JSON.stringify(current));
  } catch { /* private browsing must not break the quote */ }
}
