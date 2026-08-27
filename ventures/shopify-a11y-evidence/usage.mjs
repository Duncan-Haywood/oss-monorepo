export function recordUsage(storage = globalThis.localStorage, optOut = false, event = 'report_generated') {
  if (optOut || !storage) return;
  const key = 'shopify-a11y-evidence-usage';
  let current = {};
  try { current = JSON.parse(storage.getItem(key) || '{}'); } catch { current = {}; }
  current[event] = Number(current[event] || 0) + 1;
  storage.setItem(key, JSON.stringify(current));
}
