const KEY = "grant-deadline-tracker:usage";
export function usageAllowed(storage = globalThis.localStorage) {
  if (globalThis.navigator?.doNotTrack === "1" || globalThis.navigator?.globalPrivacyControl === true || globalThis.navigator?.globalPrivacyControl === "true") return false;
  try { return storage?.getItem("grant-deadline-tracker:usage-off") !== "1"; } catch { return false; }
}
export function countUsage(event, storage = globalThis.localStorage) {
  if (!usageAllowed(storage) || !storage) return;
  try {
    const counts = JSON.parse(storage.getItem(KEY) || "{}");
    counts[event] = Number(counts[event] || 0) + 1;
    storage.setItem(KEY, JSON.stringify(counts));
  } catch { /* Private browsing can deny storage; usage must never break the tool. */ }
}
