// Anonymous, aggregate-only local usage counts. Event name and day only —
// never invoice contents, filenames, amounts, or identifiers.

const STORAGE_KEY = "einvoice-preflight-usage";

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "invoice_preflight_checked") {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  let current = {};
  try {
    const loaded = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    if (loaded && typeof loaded === "object") current = loaded;
  } catch {
    current = {};
  }
  current[event] = (Number(current[event]) || 0) + 1;
  current.last_day = today;
  storage.setItem(STORAGE_KEY, JSON.stringify(current));
}
