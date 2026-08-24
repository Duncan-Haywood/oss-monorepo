export function recordUsage(storage, optOut) {
  if (optOut) return;
  try {
    const key = 'job-margin-variance-usage';
    const current = JSON.parse(storage.getItem(key) || '{}');
    storage.setItem(key, JSON.stringify({ report_generated: Number(current.report_generated || 0) + 1 }));
  } catch { /* blocked storage is a valid privacy choice */ }
}
