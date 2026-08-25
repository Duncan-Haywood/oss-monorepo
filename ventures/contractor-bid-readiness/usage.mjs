const KEY = 'contractor-bid-readiness-usage';
export function recordUsage(event, enabled = true) {
  if (!enabled) return;
  const counts = JSON.parse(localStorage.getItem(KEY) || '{}');
  counts[event] = (counts[event] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(counts));
}
