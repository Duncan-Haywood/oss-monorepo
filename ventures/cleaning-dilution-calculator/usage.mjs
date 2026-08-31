function privacySignal() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = 'calculated') {
  if (optedOut || !storage || privacySignal()) return;
  // Usage is optional telemetry. A blocked, full, or corrupted storage value
  // must never throw out of this call: it runs from inside the same debounced
  // callback that shows the calculated result, and an uncaught error here has
  // nothing to do with whether the dilution numbers on screen are right.
  try {
    const key = 'cleaning-dilution-usage';
    let current = {};
    try {
      current = JSON.parse(storage.getItem(key) || '{}');
      if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    } catch {
      current = {};
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = new Date().toISOString().slice(0, 10);
    storage.setItem(key, JSON.stringify(current));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}
