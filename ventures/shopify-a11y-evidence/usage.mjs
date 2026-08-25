function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optOut = false, event = "report_generated") {
  if (optOut || !storage || honorsBrowserSignal()) return;
  const key = "shopify-a11y-evidence-usage";
  let current = {};
  try {
    current = JSON.parse(storage.getItem(key) || "{}");
  } catch {
    current = {};
  }
  current[event] = Number(current[event] || 0) + 1;
  current.last_day = new Date().toISOString().slice(0, 10);
  storage.setItem(key, JSON.stringify(current));
}
