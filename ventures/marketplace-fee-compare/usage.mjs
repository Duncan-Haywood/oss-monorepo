// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores prices,
// costs, categories, order volumes, or any other input — a seller's landed cost
// is exactly the sort of thing that must not be transmitted anywhere — and it
// never leaves the device.
//
// Same shape and same guarantees as the sibling seller calculators, so the
// counters remain comparable across the portfolio.

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

export const USAGE_KEY = "marketplace-fee-compare-usage";

export function recordUsage(
  storage = globalThis.localStorage,
  optedOut = false,
  event = "comparison_run",
) {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(USAGE_KEY) || "{}");
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be full, disabled, or blocked by the browser's site settings.
    // None of those is a reason for the calculator to stop calculating.
  }
}
