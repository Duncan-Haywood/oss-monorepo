const KEY = 'kdp-royalty-calculator-usage-v1';

function honorsBrowserSignal() {
  try {
    return (
      globalThis.navigator?.doNotTrack === '1' ||
      globalThis.window?.doNotTrack === '1' ||
      globalThis.navigator?.globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}

export function recordUsage(event, optedOut = false, storage = globalThis.localStorage) {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const entries = JSON.parse(storage.getItem(KEY) || '{}');
    const day = new Date().toISOString().slice(0, 10);
    entries[`${event}:${day}`] = (entries[`${event}:${day}`] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* Calculator remains useful when storage is unavailable. */
  }
}
