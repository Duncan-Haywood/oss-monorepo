// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores the
// sale price, the loan payoff, an address, or any other worksheet input, and
// it never leaves the device.
function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "net_sheet_calculated") {
  if (optedOut || !storage || honorsBrowserSignal()) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem("seller-net-sheet-usage") || "{}");
  current[event] = (current[event] || 0) + 1;
  current.last_day = today;
  storage.setItem("seller-net-sheet-usage", JSON.stringify(current));
}
