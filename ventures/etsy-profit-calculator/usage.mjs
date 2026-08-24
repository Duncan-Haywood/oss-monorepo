export function recordUsage(storage = globalThis.localStorage, optedOut = false) {
  const privacySignal = globalThis.navigator?.globalPrivacyControl || globalThis.navigator?.doNotTrack === '1';
  if (optedOut || privacySignal || !storage) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('etsy-profit-usage') || '{}');
  current.order_profit_calculated = (current.order_profit_calculated || 0) + 1;
  current.last_day = today;
  storage.setItem('etsy-profit-usage', JSON.stringify(current));
}