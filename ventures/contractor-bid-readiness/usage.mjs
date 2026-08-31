const KEY = 'contractor-bid-readiness-usage';

function trackingDenied() {
  try {
    return globalThis.navigator?.doNotTrack === '1' || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(event, enabled = true) {
  if (!enabled || trackingDenied()) return;
  // Usage is optional telemetry, called as the last statement of each click
  // handler in index.html with no try/catch around it there. A blocked, full,
  // or corrupted storage value must never throw out of this call -- an
  // uncaught error here would surface as a broken button even though the
  // readiness check (or the report download) it follows already succeeded.
  try {
    let counts = {};
    try {
      counts = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}');
      if (!counts || typeof counts !== 'object' || Array.isArray(counts)) counts = {};
    } catch {
      counts = {};
    }
    counts[event] = (Number.isFinite(counts[event]) ? counts[event] : 0) + 1;
    globalThis.localStorage?.setItem(KEY, JSON.stringify(counts));
  } catch {
    // Private browsing and storage quotas are normal browser conditions.
  }
}
