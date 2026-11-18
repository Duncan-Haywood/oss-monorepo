// Anonymous, aggregate-only local counts: event name and day, in this browser.
// Never stores prices, costs, or other inputs, and never leaves the device.
// Reading the `localStorage` global throws SecurityError when the visitor
// blocks site data (Chrome's "block all cookies", Safari with cookies
// blocked), and a default parameter is evaluated before any try in the body.
// So the defaults below, and the page's calls, go through this instead of
// naming the global: a blocked store reads as "no storage", never a crash.
export function usageStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function honorsBrowserSignal(navigatorLike = globalThis.navigator) {
  try {
    return navigatorLike?.doNotTrack === "1" || navigatorLike?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(
  storage = usageStorage(),
  optedOut = false,
  event = "quote_calculated",
  navigatorLike = globalThis.navigator,
) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optedOut || !storage || honorsBrowserSignal(navigatorLike)) return;
  try {
    const key = "appliance-repair-usage";
    let current = JSON.parse(storage.getItem(key) || "{}");
    if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
    const day = new Date().toISOString().slice(0, 10);
    current[event] = (current[event] || 0) + 1;
    current.last_day = day;
    storage.setItem(key, JSON.stringify(current));
  } catch {
    // Private browsing must not break the quote.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem("appliance-repair-usage-opt-out") === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = usageStorage(), optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem("appliance-repair-usage"); } catch { /* storage is optional */ }
    try { storage.setItem("appliance-repair-usage-opt-out", "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem("appliance-repair-usage-opt-out"); } catch { /* storage is optional */ }
  }
}
