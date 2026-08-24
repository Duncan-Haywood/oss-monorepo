export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'order_profit_calculated') {
  if (optedOut || !storage) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('etsy-profit-usage') || '{}');
  current[eventName] = (current[eventName] || 0) + 1;
  current.last_day = today;
  storage.setItem('etsy-profit-usage', JSON.stringify(current));
}
