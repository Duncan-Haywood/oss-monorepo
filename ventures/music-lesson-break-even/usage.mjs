function browserOptOut() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'lesson_price_calculated') {
  if (optedOut || !storage || browserOptOut()) return;
  // Usage is optional telemetry. This call sits inside the same try block that
  // renders the priced lesson (update() in index.html), so a blocked, full, or
  // corrupted storage value must never throw here -- otherwise the outer catch
  // would surface the storage error in the visible #errors banner as if the
  // price itself were wrong, even though it computed and rendered correctly.
  try {
    let current = {};
    try {
      current = JSON.parse(storage.getItem('music-lesson-usage') || '{}');
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    } catch {
      current = {};
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem('music-lesson-usage', JSON.stringify(current));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}
