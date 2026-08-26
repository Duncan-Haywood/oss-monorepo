function honorsBrowserSignal() {
  return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'plan_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const current = JSON.parse(storage.getItem('hvac-maintenance-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = new Date().toISOString().slice(0, 10);
  storage.setItem('hvac-maintenance-usage', JSON.stringify(current));
}
