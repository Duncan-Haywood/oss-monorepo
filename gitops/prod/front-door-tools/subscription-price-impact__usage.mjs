const KEY = 'subscription-price-impact-usage-v1';
export function recordUsage(event, optedOut = false) {
  if (optedOut || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try {
    const entries = JSON.parse(localStorage.getItem(KEY) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    entries[`${event}:${day}`] = (entries[`${event}:${day}`] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch { /* Calculator remains useful when storage is unavailable. */ }
}
