// Anonymous, aggregate-only local counts: event name and day, in this browser.
// Never stores prices, costs, or other inputs, and never leaves the device.
function honorsBrowserSignal(navigatorLike = globalThis.navigator) {
  try {
    return navigatorLike?.doNotTrack === "1" || navigatorLike?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(
  storage = globalThis.localStorage,
  optedOut = false,
  event = "quote_calculated",
  navigatorLike = globalThis.navigator,
) {
  if (optedOut || !storage || honorsBrowserSignal(navigatorLike)) return;
  try {
    const key = "appliance-repair-usage";
    const current = JSON.parse(storage.getItem(key) || "{}");
    const day = new Date().toISOString().slice(0, 10);
    current[event] = (current[event] || 0) + 1;
    current.last_day = day;
    storage.setItem(key, JSON.stringify(current));
  } catch {
    // Private browsing must not break the quote.
  }
}
