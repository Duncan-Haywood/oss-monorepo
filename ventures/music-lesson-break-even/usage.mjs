function browserOptOut() {
  return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'lesson_price_calculated') {
  if (optedOut || !storage || browserOptOut()) return;
  const current = JSON.parse(storage.getItem('music-lesson-usage') || '{}');
  current[event] = (current[event] || 0) + 1;
  current.last_day = new Date().toISOString().slice(0, 10);
  storage.setItem('music-lesson-usage', JSON.stringify(current));
}
