// Shareable session link.
//
// A link that reopens the calculator with the same numbers already in it
// lets a partner, a spouse doing the household books, or future-you try a
// different gas price or a different session's miles against the same
// vehicle-cost assumptions, instead of retyping ten figures from a text
// message.
//
// The transform is pure -- no DOM, no storage, no network -- and the page
// puts the payload in the URL fragment, which browsers never send to a
// server. Gross pay, miles, and vehicle costs stay on the two devices the
// link is pasted between, the same promise the rest of this calculator
// makes.

/** Mirrors `FIELD_IDS` in `index.html`. */
export const NUMBER_FIELD_IDS = Object.freeze([
  "grossPay", "milesDriven", "hoursActive", "mpg", "gasPrice",
  "maintenancePerMile", "insuranceMonthly", "otherFixedMonthly", "monthlyMiles",
  "taxReservePercent", "comparisonHourlyWage", "targetHourlyTakeHome",
]);

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
  return inputs;
}
