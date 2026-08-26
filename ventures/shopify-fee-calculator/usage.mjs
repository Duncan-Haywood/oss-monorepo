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

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "order_profit_calculated") {
  if (optedOut || !storage || honorsBrowserSignal() || !/^[a-z0-9_]+$/.test(event)) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem("shopify-fee-usage") || "{}");
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem("shopify-fee-usage", JSON.stringify(current));
}
