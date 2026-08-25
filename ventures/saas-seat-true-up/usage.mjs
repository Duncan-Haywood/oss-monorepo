const KEY = 'saas-seat-true-up:usage';

export function recordEvent(eventName) {
  if (typeof localStorage === 'undefined' || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  const current = JSON.parse(localStorage.getItem(KEY) || '{}');
  current[eventName] = (current[eventName] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function disableUsage() {
  localStorage.removeItem(KEY);
}
