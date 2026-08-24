const KEY = 'mobile-detailing-bid-usage';
export function recordUsage(event) {
  if (typeof localStorage === 'undefined' || navigator.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl) return;
  try { const data = JSON.parse(localStorage.getItem(KEY) || '{}'); data[event] = (data[event] || 0) + 1; data.lastUsed = new Date().toISOString().slice(0, 10); localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage can be disabled */ }
}
