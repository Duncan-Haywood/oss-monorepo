// Anonymous, aggregate-only local counts: event name and day, in this browser.
// Never stores prices, costs, or other inputs, and never leaves the device.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = "brand_order_calculated") {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem("faire-wholesale-usage") || "{}");
  current[eventName] = (current[eventName] || 0) + 1;
  current.last_day = today;
  storage.setItem("faire-wholesale-usage", JSON.stringify(current));
}
