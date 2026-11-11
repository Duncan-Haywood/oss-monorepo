function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'landed_cost_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  let current = JSON.parse(storage.getItem('import-landed-cost-usage') || '{}');
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  current[eventName] = (current[eventName] || 0) + 1;
  current.last_day = today;
  storage.setItem('import-landed-cost-usage', JSON.stringify(current));
}
