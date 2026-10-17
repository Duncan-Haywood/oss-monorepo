const KEY = "claude-skill-scaffold-generator:usage";
const OFF_KEY = "claude-skill-scaffold-generator:usage-off";

export function usageAllowed(storage = globalThis.localStorage, navigatorLike = globalThis.navigator) {
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

export function setUsageEnabled(enabled, storage = globalThis.localStorage) {
  try {
    if (!storage) return;
    if (enabled) storage.removeItem(OFF_KEY);
    else storage.setItem(OFF_KEY, "1");
  } catch {
    /* Private browsing can deny storage; usage must never break the tool. */
  }
}

export function countUsage(event, storage = globalThis.localStorage, navigatorLike = globalThis.navigator) {
  if (!usageAllowed(storage, navigatorLike) || !storage) return;
  try {
    const counts = JSON.parse(storage.getItem(KEY) || "{}");
    counts[event] = Number(counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch {
    /* Private browsing can deny storage; usage must never break the tool. */
  }
}
