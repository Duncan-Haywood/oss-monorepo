const KEY = "3pl-quote-normalizer-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  let current;
  try { current = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { current = {}; }
  if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
  current[event] = (current[event] || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage is optional */ }
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
