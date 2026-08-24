export function recordUsage(storage, optOut) {
  if (optOut || !storage) return;
  try { storage.setItem('cut-list-optimizer-runs', String(Number(storage.getItem('cut-list-optimizer-runs') || 0) + 1)); } catch { /* private browsing can deny storage */ }
}
