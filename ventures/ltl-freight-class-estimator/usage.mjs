const KEY = 'ltl-freight-class-usage';

export function usageAllowed() {
  try {
    if (localStorage.getItem('ltl-freight-class-usage-off') === '1') return false;
  } catch { return false; }
  return navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
}

export function recordUsage(event) {
  if (!usageAllowed()) return;
  try {
    const current = JSON.parse(localStorage.getItem(KEY) || '{}');
    current[event] = (current[event] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch { /* Private browsing may deny local storage. */ }
}

export function clearUsage() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem('ltl-freight-class-usage-off', '1');
  } catch { /* Private browsing may deny local storage. */ }
}
