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
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
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

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${key}-opt-out`) === "1";
  } catch {
    // A blocked or full store must never be read as consent.
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  if (!storage) return;
  // Independent writes, counters first: sharing one try means a setItem
  // that throws on a full quota skips the delete entirely, and the
  // visitor gets neither half of what the control promised.
  if (optedOut) {
    try { storage.removeItem(key); } catch { /* storage is optional */ }
    try { storage.setItem(`${key}-opt-out`, "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${key}-opt-out`); } catch { /* storage is optional */ }
  }
}
