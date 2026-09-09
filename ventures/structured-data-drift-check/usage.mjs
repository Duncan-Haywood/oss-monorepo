const KEY = "structured-data-drift-check-usage";

function usageBlocked() {
  if (globalThis.__usageOptOut) return true;
  try {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return true;
  } catch {
    /* navigator is optional in tests */
  }
  return false;
}

export function record(event) {
  if (typeof localStorage === "undefined" || usageBlocked()) return;
  let current;
  try {
    current = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    current = {};
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}

export function readUsage() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
