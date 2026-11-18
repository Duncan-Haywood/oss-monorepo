// Records an anonymous, aggregate-only local usage count: the event name and
// the current day, kept in the visitor's own browser. It never stores ticket
// prices, food costs, commissions, or any other calculator input, and never
// leaves the device. There is no server to send it to.
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

const KEY = "delivery-app-margin-usage";

function honorsBrowserSignal() {
  try {
    return globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function recordUsage(storage = usageStorage(), optedOut = false, event = "comparison_calculated") {
  // The stored choice is consulted here as well as passed in. The page reads
  // it into the checkbox on load and hands the checkbox back, which works —
  // but it makes the promise depend on one line of page wiring, and a caller
  // that forgets the second argument would count a visitor who opted out.
  // The module now honours its own record of the choice either way.
  if (optedOut || !storage || readOptOut(storage) || honorsBrowserSignal()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    let current = JSON.parse(storage.getItem(KEY) || "{}");
    if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
    current[event] = (current[event] || 0) + 1;
    current.last_day = today;
    storage.setItem(KEY, JSON.stringify(current));
  } catch {
    // A full or unavailable storage quota must never break the calculator —
    // the counter is a convenience, the arithmetic is the product.
  }
}

export function readUsage(storage = usageStorage()) {
  try {
    return JSON.parse(storage?.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

// The opt-out choice is itself kept locally so the visitor does not have to
// make it again on every visit.
export function readOptOut(storage = usageStorage()) {
  try {
    return storage?.getItem(`${KEY}-opt-out`) === "1";
  } catch {
    return false;
  }
}

export function writeOptOut(storage = usageStorage(), optedOut = false) {
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
