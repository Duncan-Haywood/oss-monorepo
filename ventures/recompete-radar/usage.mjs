// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores prices,
// NAICS codes, states, vendors, or any other input — a company's target
// market is exactly the sort of thing that must not be transmitted anywhere — and it
// never leaves the device.
//
// Same shape and same guarantees as the sibling tools, so the
// counters remain comparable across the portfolio.

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

function honorsBrowserSignal() {
  try {
    return (
      globalThis.navigator?.doNotTrack === "1" ||
      globalThis.navigator?.globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}

export const USAGE_KEY = "recompete-radar-usage";

export function recordUsage(
  storage = usageStorage(),
  optedOut = false,
  event = "search_run",
) {
  // The visitor's stored choice, consulted before anything else: the
  // caller passes its own idea of it, and on most pages here that came
  // from a control that had forgotten.
  if (readOptOut(storage)) return;
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem(USAGE_KEY) || "{}");
    if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be full, disabled, or blocked by the browser's site settings.
    // None of those is a reason for the calculator to stop calculating.
  }
}

// The opt-out choice is kept in its own key, not in the counters:
// opting out *removes* the counters, so a flag stored inside them would
// be deleted by the very act it records. The recorder above consults it
// directly, so the promise does not depend on a caller remembering to
// pass the choice in.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem(`${USAGE_KEY}-opt-out`) === "1";
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
    try { storage.removeItem(USAGE_KEY); } catch { /* storage is optional */ }
    try { storage.setItem(`${USAGE_KEY}-opt-out`, "1"); } catch { /* storage is optional */ }
  } else {
    try { storage.removeItem(`${USAGE_KEY}-opt-out`); } catch { /* storage is optional */ }
  }
}
