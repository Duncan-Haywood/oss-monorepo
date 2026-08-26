function privacySignal() {
  return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  if (optedOut || !storage || privacySignal()) return;
  const key = 'cleaning-dilution-usage';
  const current = JSON.parse(storage.getItem(key) || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = new Date().toISOString().slice(0, 10);
  storage.setItem(key, JSON.stringify(current));
}
