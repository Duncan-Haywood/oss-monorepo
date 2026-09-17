// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores ticket
// prices, food costs, commissions, or any other calculator input, and never
// leaves the device. There is no server to send it to.
const KEY = "delivery-app-margin-usage";

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = globalThis.localStorage, optedOut = false, event = "comparison_calculated") {
  // The stored choice is consulted here as well as passed in. The page reads
  // it into the checkbox on load and hands the checkbox back, which works —
  // but it makes the promise depend on one line of page wiring, and a caller
  // that forgets the second argument would count a visitor who opted out.
  // The module now honours its own record of the choice either way.
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = JSON.parse(storage.getItem(KEY) || "{}");
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(KEY, JSON.stringify(current));
  } catch {
    // A full or unavailable storage quota must never break the calculator —
    // the counter is a convenience, the arithmetic is the product.
  }
}

export function readUsage(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

// The opt-out choice is itself kept locally so the visitor does not have to
// make it again on every visit.
export function readOptOut(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(`${KEY}-opt-out`) === "1";
  } catch {
    return false;
  }
}

export function writeOptOut(storage = globalThis.localStorage, optedOut = false) {
  try {
    if (optedOut) {
      storage?.setItem(`${KEY}-opt-out`, "1");
      storage?.removeItem(KEY);
    } else {
      storage?.removeItem(`${KEY}-opt-out`);
    }
  } catch {
    // Ignore: see recordUsage.
  }
}
