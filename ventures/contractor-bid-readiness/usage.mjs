const KEY = 'contractor-bid-readiness-usage';

function trackingDenied() {
  return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

export function recordUsage(event, enabled = true) {
  if (!enabled || trackingDenied()) return;
  const counts = JSON.parse(localStorage.getItem(KEY) || '{}');
  counts[event] = (counts[event] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(counts));
}
