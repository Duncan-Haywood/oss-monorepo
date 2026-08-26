const KEY = 'notary-trip-quote-usage';
export function recordUsage(event) {
  if (typeof window === 'undefined' || !event || navigator.doNotTrack === '1' || navigator.globalPrivacyControl || localStorage.getItem('notary-trip-quote-optout') === '1') return;
  try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); const day = new Date().toISOString().slice(0, 10); data[day] = data[day] || {}; data[day][event] = (data[day][event] || 0) + 1; localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* Storage is optional. */ }
}
