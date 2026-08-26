// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// prices, costs, or any calculator input, and never leaves the device.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "listing_profit_calculated") {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let current = {};
    try {
      const stored = JSON.parse(storage.getItem("amazon-fba-usage") || "{}");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) current = stored;
    } catch {
      // A corrupt local counter should never stop the calculator from working.
    }
    current[event] = (Number.isFinite(current[event]) ? current[event] : 0) + 1;
    current.last_day = today;
    storage.setItem("amazon-fba-usage", JSON.stringify(current));
  } catch {
    // Storage can be unavailable in private browsing or with a blocked quota.
  }
}
