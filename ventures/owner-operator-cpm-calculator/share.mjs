// Shareable week link.
//
// This page's own "Copy week summary" button already turns a session into
// text, but text is where the conversation stops -- a dispatcher or a second
// driver reading it cannot change one number and see the break-even rate
// move. A link that reopens the calculator with the same twenty numbers
// already in it lets the recipient try their own diesel price or their own
// deadhead miles against the same fixed costs, instead of retyping a week's
// worth of figures from a text message.
//
// Every numeric field the page reads rides in the link -- a dropped field is
// not cosmetic here, since the recipient would see a break-even rate solved
// from an incomplete week with no visible sign anything is missing. The one
// checkbox (`factorAccessorials`) rides too, because it flips which of the
// two comparison-table columns the headline profit is drawn from.
//
// The transform is pure -- no DOM, no storage, no network -- and the page
// puts the payload in the URL fragment, which browsers never send to a
// server. Fuel prices, the truck note, and the offered rate stay on the two
// devices the link is pasted between, the same promise the rest of this
// calculator makes.

/** Mirrors `FIELD_IDS` in `index.html`. */
export const NUMBER_FIELD_IDS = Object.freeze([
  "loadedMiles", "emptyMiles", "mpg", "dieselPrice",
  "truckPayment", "insurance", "permits", "otherFixed",
  "maintenancePerMile", "tiresPerMile", "otherVariablePerMile",
  "factoringRate", "offeredLoadedRate", "taxReservePercent", "targetWeeklyTakeHome",
  "detentionHours", "detentionPayPerHour", "layoverPay",
  "lumperPaid", "lumperReimbursed",
]);

/** The one checkbox the calculation reads. */
export const BOOLEAN_FIELD_ID = "factorAccessorials";

// `usageOptOut` is deliberately absent, same reasoning as every other share
// link in this fleet: it is the recipient's own privacy choice about their
// own browser, and a sender should not be able to switch counting back on --
// or off -- for someone else by handing them a link.

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank and unusable fields are omitted rather than sent as empty strings, so
 * the recipient's page keeps its own starting default for anything the
 * sender left alone instead of being handed a field it must treat as zero.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  if (typeof inputs?.[BOOLEAN_FIELD_ID] === "boolean") {
    params.set(BOOLEAN_FIELD_ID, inputs[BOOLEAN_FIELD_ID] ? "1" : "0");
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * throwing: a truncated link pasted into a text message should open the page
 * on the fields that survived, not on an error.
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
  if (params.has(BOOLEAN_FIELD_ID)) {
    inputs[BOOLEAN_FIELD_ID] = params.get(BOOLEAN_FIELD_ID) === "1";
  }
  return inputs;
}
