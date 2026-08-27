export function recordUsage(storage, optOut, navigatorLike = globalThis.navigator) {
  if (optOut) return;
  if (
    navigatorLike?.doNotTrack === '1' ||
    navigatorLike?.globalPrivacyControl === true ||
    navigatorLike?.globalPrivacyControl === 'true'
  ) {
    return;
  }
  try {
    const key = 'job-margin-variance-usage';
    const current = JSON.parse(storage.getItem(key) || '{}');
    storage.setItem(key, JSON.stringify({
      report_generated: Number(current.report_generated || 0) + 1,
    }));
  } catch { /* blocked storage is a valid privacy choice */ }
}
