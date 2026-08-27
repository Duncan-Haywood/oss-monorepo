// Two ways to put this calculator's state in a URL, for two different jobs.
//
// `encodeShareState` / `decodeShareState` carry the *whole* scenario as one
// versioned base64 token. Every field must be present and valid or the decode
// is refused, which is what makes a shared link trustworthy: the recipient
// either sees exactly what the sender saw, or is told the link is unreadable.
// Its field list must never change without a version bump — the decoder
// compares key sets exactly, so adding a name would reject every link already
// sent.
//
// `encodeInputs` / `decodeInputs` carry *whatever is known*, as ordinary query
// text. That is what a handoff from another calculator needs:
// `where-to-sell-calculator` compares one item across eBay, Etsy, Amazon, an
// own store and a direct sale, and knows the item's price and costs but
// nothing about this page's Shopify plan, promo, or POS assumptions. Refusing
// a partial link would leave the "own store" row of that comparison with no
// way through, which is the state it was in before this existed.
//
// The two do not share a decoder on purpose. A whole-scenario link must fail
// closed; a handoff link must fill in what it can and leave the rest at this
// page's own starting figures.

const VERSION = 1;
const PAYMENT_METHODS = new Set(["shopify_payments", "third_party"]);
const NUMERIC_FIELDS = [
  "price", "shippingCharged", "paymentsRate", "paymentsFixed", "shopifyTxnRate",
  "processorRate", "processorFixed", "costOfGoods", "shippingCost", "packagingCost",
  "otherCost", "monthlyPlan", "monthlyOrders", "targetMargin",
  "percentOff", "amountOff",
];

/**
 * The page's input ids, by section, so `index.html` and this module read one
 * list. A second copy beside an encoder is how a link silently loses a field:
 * `where-to-sell-calculator` shipped exactly that, dropping `quantity` and
 * `targetMargin` so the recipient computed a different profit than the sender
 * saw, and nothing went red.
 */
export const ORDER_FIELDS = [
  "price", "shippingCharged", "paymentsRate", "paymentsFixed", "shopifyTxnRate",
  "processorRate", "processorFixed", "costOfGoods", "shippingCost", "packagingCost",
  "otherCost", "monthlyPlan", "monthlyOrders", "targetMargin", "targetProfit",
];
export const PROMO_FIELDS = ["percentOff", "amountOff"];
export const INSTALLMENT_FIELDS = [
  "installmentRate", "installmentFixed", "installmentSharePct", "extraOrdersFromInstallments",
];
export const LABEL_FIELDS = ["shopifyLabelCost", "ownLabelCost"];
export const POS_FIELDS = ["posPaymentsRate", "posPaymentsFixed", "posHardwareCost"];

/** Every numeric input a link may carry. Imported by name from other ventures. */
export const FIELD_IDS = [
  ...ORDER_FIELDS, ...PROMO_FIELDS, ...INSTALLMENT_FIELDS, ...LABEL_FIELDS, ...POS_FIELDS,
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

/**
 * Encode whatever inputs are known as ordinary query text.
 *
 * Only finite, non-negative numbers are written; a blank field is omitted so
 * the link says nothing about it rather than pinning it to zero.
 */
export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of FIELD_IDS) {
    const raw = input?.[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  if (PAYMENT_METHODS.has(input?.paymentMethod)) params.set("paymentMethod", input.paymentMethod);
  return params.toString();
}

/**
 * Read whatever a partial link carries, ignoring anything unreadable.
 *
 * Returns only the fields actually present and valid, so the caller applies
 * them over this page's defaults. Junk yields an empty object rather than an
 * error: the page still works, it just shows its own numbers, which is the
 * safe failure for a tool nobody is supervising.
 */
export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || "").replace(/^[?#]/, ""));
  const result = {};
  for (const field of FIELD_IDS) {
    if (!params.has(field)) continue;
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  const method = params.get("paymentMethod");
  if (PAYMENT_METHODS.has(method)) result.paymentMethod = method;
  return result;
}
