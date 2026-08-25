export function recordUsage(storage = globalThis.localStorage, optedOut = false, eventName = "brand_order_calculated") {
  if (optedOut || !storage) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = JSON.parse(storage.getItem("faire-wholesale-usage") || "{}");
  current[eventName] = (current[eventName] || 0) + 1;
  current.last_day = today;
  storage.setItem("faire-wholesale-usage", JSON.stringify(current));
}
