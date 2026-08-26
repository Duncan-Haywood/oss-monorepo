function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = 'reverb_sale_calculated') {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem('reverb-fee-usage') || '{}');
  current[eventName] = (current[eventName] || 0) + 1;
  current.last_day = today;
  storage.setItem('reverb-fee-usage', JSON.stringify(current));
}
