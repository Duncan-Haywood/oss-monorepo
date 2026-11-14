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

const KEY = "llm-api-pricing-calculator:usage";
const OFF_KEY = "llm-api-pricing-calculator:usage-off";

export function usageAllowed(storage = usageStorage(), navigatorLike = globalThis.navigator) {
  if (
    navigatorLike?.doNotTrack === "1" ||
    navigatorLike?.globalPrivacyControl === true ||
    navigatorLike?.globalPrivacyControl === "true"
  ) {
    return false;
  }
  try {
    return storage?.getItem(OFF_KEY) !== "1";
  } catch {
    return false;
  }
}

export function setUsageEnabled(enabled, storage = usageStorage()) {
  try {
    if (!storage) return;
    if (enabled) storage.removeItem(OFF_KEY);
    else storage.setItem(OFF_KEY, "1");
  } catch {
    /* Private browsing can deny storage; usage must never break the tool. */
  }
}

export function countUsage(event, storage = usageStorage(), navigatorLike = globalThis.navigator) {
  if (!usageAllowed(storage, navigatorLike) || !storage) return;
  try {
    let counts = JSON.parse(storage.getItem(KEY) || "{}");
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) counts = {};
    counts[event] = Number(counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch {
    /* Private browsing can deny storage; usage must never break the tool. */
  }
}
