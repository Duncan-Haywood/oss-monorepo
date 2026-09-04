// Two ways to put this calculator's state in a URL, for two different jobs.
//
// `encodeShareState` / `decodeShareState` carry the *whole* scenario as one
// versioned base64 token. The core must be present and everything present must
// be valid or the decode is refused, which is what makes a shared link
// trustworthy: the recipient either sees exactly what the sender saw, or is
// told the link is unreadable.
//
// "The whole scenario" was a claim this made and did not keep, until
// 2026-08-29. The token carried a hand-kept `NUMERIC_FIELDS` list of sixteen
// names while the page had grown to twenty-six inputs across five panels, and
// `applyShare` in `index.html` wrote back only two of those panels. So a
// merchant who set their Shop Pay Installments rate, their two label costs and
// their three POS rates, copied the link, and sent it to their bookkeeper had
// them read *this page's example figures* in the Installments, label and POS
// comparisons — three verdicts about real money, silently different from the
// ones on the sender's screen, under a headline profit that matched exactly.
// `targetProfit` and the Shopify plan itself went the same way; the plan drives
// which row `comparePlans` marks as current, so even the plan table differed.
//
// The list is therefore no longer kept twice. `FIELD_IDS` — the same list the
// page builds its form from — is what the token carries, so an input added to
// the form is in the link the moment it exists.
//
// Growing the list stays backward compatible rather than needing a version
// bump: `CORE_FIELDS` (the v1 sixteen) is what a payload must contain, and
// anything beyond it is optional on the way in. A link sent before a field
// existed still decodes, and the fields it does not mention keep this page's
// own starting figures. What is refused is a payload carrying a name this
// build does not know, or a value the calculator would reject.
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

// The plan ids come from the presets themselves rather than a copy kept here.
// A second list is the whole reason this file needed the repair above.
import { PLAN_IDS } from "./calc.mjs";

const VERSION = 1;
const PAYMENT_METHODS = new Set(["shopify_payments", "third_party"]);

/**
 * The sixteen names version 1 of the token always carried. A payload without
 * all of them is not a share link from this calculator, so it is still refused
 * outright. Everything past this list is optional, which is what lets the list
 * of carried fields grow without invalidating a link already sent.
 */
const CORE_FIELDS = [
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

/** The invariants both directions enforce, so an encoder and a decoder cannot drift. */
function checkScenario(state, message) {
  if (state.targetMargin >= 100 || (state.monthlyOrders === 0 && state.monthlyPlan > 0)) throw new Error(message);
}

export function encodeShareState(input) {
  const state = { v: VERSION, paymentMethod: input.paymentMethod };
  FIELD_IDS.forEach((field) => { state[field] = Number(input[field]); });
  if (!PAYMENT_METHODS.has(state.paymentMethod) || FIELD_IDS.some((field) => !Number.isFinite(state[field]) || state[field] < 0)) throw new Error("Cannot share invalid calculator inputs");
  // The plan is a select rather than a number, and it is not decoration: it is
  // the row `comparePlans` marks as the one the merchant is on. A link without
  // it puts the recipient on Basic whatever the sender was on.
  if (PLAN_IDS.includes(input.planId)) state.planId = input.planId;
  checkScenario(state, "Cannot share invalid calculator inputs");
  return toBase64Url(JSON.stringify(state));
}

const KNOWN_KEYS = new Set(["v", "paymentMethod", "planId", ...FIELD_IDS]);

export function decodeShareState(payload) {
  let state;
  try { state = JSON.parse(fromBase64Url(payload)); } catch { throw new Error("Invalid shared calculation link"); }
  if (!state || state.v !== VERSION || !PAYMENT_METHODS.has(state.paymentMethod)) throw new Error("Unsupported shared calculation link");
  // A name this build does not know is refused rather than ignored: it means
  // the link was written by something else, and quietly dropping it is how a
  // recipient ends up looking at a scenario nobody sent.
  if (Object.keys(state).some((key) => !KNOWN_KEYS.has(key))) throw new Error("Invalid shared calculation link");
  if (CORE_FIELDS.some((field) => !(field in state))) throw new Error("Invalid shared calculation link");
  const carried = FIELD_IDS.filter((field) => field in state);
  if (carried.some((field) => typeof state[field] !== "number" || !Number.isFinite(state[field]) || state[field] < 0)) throw new Error("Invalid shared calculation link");
  if ("planId" in state && !PLAN_IDS.includes(state.planId)) throw new Error("Invalid shared calculation link");
  checkScenario(state, "Invalid shared calculation link");
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
