export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'bid_calculated') {
  if (optedOut || !storage) return;
  try {
    const current = JSON.parse(storage.getItem('mobile-detailing-usage') || '{}');
    current[eventName] = (current[eventName] || 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem('mobile-detailing-usage', JSON.stringify(current));
  } catch { /* A blocked localStorage must not break the calculator. */ }
}
