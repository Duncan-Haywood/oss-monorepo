export function recordUsage(storage = globalThis.localStorage, optOut = false) {
  if (optOut || !storage) return;
  const key = 'shopify-a11y-evidence-usage';
  let current = {};
  try { current = JSON.parse(storage.getItem(key) || '{}'); } catch { current = {}; }
  current.report_generated = Number(current.report_generated || 0) + 1;
  storage.setItem(key, JSON.stringify(current));
}
