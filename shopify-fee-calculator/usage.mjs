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
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optedOut || !storage || honorsBrowserSignal() || !/^[a-z0-9_]+$/.test(event)) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem("shopify-fee-usage") || "{}");
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem("shopify-fee-usage", JSON.stringify(current));
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem("shopify-fee-usage-opt-out") === "1";
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
    try { storage.removeItem("shopify-fee-usage"); } catch { /* storage is optional */ }
    try { storage.setItem("shopify-fee-usage-opt-out", "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem("shopify-fee-usage-opt-out"); } catch { /* storage is optional */ }
  }
}
