// Shareable week link.
//
// A link that reopens the calculator with the same figures already in it
// lets a payroll clerk hand a specific classification's numbers to the
// project's compliance officer, or to themselves next week, instead of
// retyping a dozen rates and hour counts from a wage determination.
//
// The transform is pure -- no DOM, no storage, no network -- and the page
// puts the payload in the URL fragment, which browsers never send to a
// server. Wage rates and hours stay on the two devices the link is pasted
// between, the same promise the rest of this calculator makes.
//
// The classification label is a free-text field used only for display and
// is deliberately not part of the link -- only the numbers that drive the
// arithmetic round-trip.

/** Mirrors the numeric FIELD_IDS in `index.html`. */
export const NUMBER_FIELD_IDS = Object.freeze([
  "requiredBaseRate", "requiredFringeRate", "actualBaseRate",
  "bonaFideFringePerHour", "cashFringePerHour", "straightHours", "overtimeHours",
  "approvedRatioApprentices", "approvedRatioJourneymen", "journeymenOnSite",
  "apprenticesOnSite", "fullJourneymanRate", "excessApprenticeHours",
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
 * Encode the page's current numeric inputs as a URL fragment payload.
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
