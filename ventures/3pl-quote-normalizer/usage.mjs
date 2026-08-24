const KEY = "3pl-quote-normalizer-usage";
export function record(event) {
  if (typeof localStorage === "undefined" || globalThis.__usageOptOut) return;
  const current = JSON.parse(localStorage.getItem(KEY) || "{}");
  current[event] = (current[event] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(current));
}
export function setUsageOptOut(value) {
  globalThis.__usageOptOut = Boolean(value);
  if (value && typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
