// Shareable comparison link.
//
// A link that reopens the calculator with the same job price and fee
// figures already in it lets a freelancer send a client's quote to a
// spouse, a co-founder, or future-them without retyping six numbers from a
// text message.
//
// The transform is pure -- no DOM, no storage, no network -- and the page
// puts the payload in the URL fragment, which browsers never send to a
// server. Job price, fee percentages, and withdrawal fees stay on the two
// devices the link is pasted between, the same promise the rest of this
// calculator makes.

/** Mirrors the numeric field ids in `index.html`. */
export const NUMBER_FIELD_IDS = Object.freeze([
  "jobPrice", "upworkFeePercent", "fiverrFeePercent",
  "upworkWithdrawalFee", "fiverrWithdrawalFee",
  "taxReservePercent", "targetTakeHome",
]);

// `usageOptOut` and `targetPlatform` are deliberately absent from the number
// list: the opt-out is the recipient's own privacy choice about their own
// browser, never the sender's to set for them. `targetPlatform` is handled
// separately below since it is not a number.

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank and unusable fields are omitted rather than sent as empty strings,
 * so the recipient's page keeps its own starting default for anything the
 * sender left alone instead of being handed a field it must treat as zero.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  if (inputs?.targetPlatform === "upwork" || inputs?.targetPlatform === "fiverr") {
    params.set("targetPlatform", inputs.targetPlatform);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * throwing: a truncated link pasted into a text message should open the
 * page on the fields that survived, not on an error.
 */
export function decodeInputs(source) {
  if (typeof source !== "string") return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ""));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  const targetPlatform = params.get("targetPlatform");
  if (targetPlatform === "upwork" || targetPlatform === "fiverr") {
    inputs.targetPlatform = targetPlatform;
  }
  return inputs;
}
