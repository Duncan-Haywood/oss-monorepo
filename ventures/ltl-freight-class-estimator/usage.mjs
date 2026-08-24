const KEY = 'ltl-freight-class-usage';

export function usageAllowed() {
  return !navigator.doNotTrack && !navigator.globalPrivacyControl;
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
  localStorage.removeItem(KEY);
}
