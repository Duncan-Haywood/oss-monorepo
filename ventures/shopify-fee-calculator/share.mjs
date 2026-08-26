const VERSION = 1;
const PAYMENT_METHODS = new Set(["shopify_payments", "third_party"]);
const NUMERIC_FIELDS = [
  "price", "shippingCharged", "paymentsRate", "paymentsFixed", "shopifyTxnRate",
  "processorRate", "processorFixed", "costOfGoods", "shippingCost", "packagingCost",
  "otherCost", "monthlyPlan", "monthlyOrders", "targetMargin",
  "percentOff", "amountOff",
];

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid shared calculation link");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeShareState(input) {
  const state = { v: VERSION, paymentMethod: input.paymentMethod };
  NUMERIC_FIELDS.forEach((field) => { state[field] = Number(input[field]); });
  if (!PAYMENT_METHODS.has(state.paymentMethod) || NUMERIC_FIELDS.some((field) => !Number.isFinite(state[field]) || state[field] < 0)) throw new Error("Cannot share invalid calculator inputs");
  if (state.targetMargin >= 100 || (state.monthlyOrders === 0 && state.monthlyPlan > 0)) throw new Error("Cannot share invalid calculator inputs");
  return toBase64Url(JSON.stringify(state));
}

export function decodeShareState(payload) {
  let state;
  try { state = JSON.parse(fromBase64Url(payload)); } catch { throw new Error("Invalid shared calculation link"); }
  if (!state || state.v !== VERSION || !PAYMENT_METHODS.has(state.paymentMethod)) throw new Error("Unsupported shared calculation link");
  const keys = Object.keys(state).sort();
  const expected = ["paymentMethod", "v", ...NUMERIC_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error("Invalid shared calculation link");
  if (NUMERIC_FIELDS.some((field) => typeof state[field] !== "number" || !Number.isFinite(state[field]) || state[field] < 0)) throw new Error("Invalid shared calculation link");
  if (state.targetMargin >= 100 || (state.monthlyOrders === 0 && state.monthlyPlan > 0)) throw new Error("Invalid shared calculation link");
  return state;
}
