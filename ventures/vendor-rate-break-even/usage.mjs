const countsKey = 'vendor-rate-break-even-usage';
const optOutKey = 'vendor-rate-break-even-usage-opt-out';

function storage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function recordUsage(event) {
  const store = storage();
  if (!store || store.getItem(optOutKey) === 'true') return;
  const counts = JSON.parse(store.getItem(countsKey) || '{}');
  counts[event] = (counts[event] || 0) + 1;
  store.setItem(countsKey, JSON.stringify(counts));
}

export function setUsageOptOut(value) {
  const store = storage();
  if (store) store.setItem(optOutKey, String(Boolean(value)));
}
