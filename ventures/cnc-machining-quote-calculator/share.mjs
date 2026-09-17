// A shop re-types the same stock, cycle-time and shop-rate assumptions every
// time it quotes a similar part. This module carries the whole form — every
// numeric rate plus which way the material is bought — into a link the shop
// can send itself, a co-owner, or a customer, without a server or an account.
//
// Nothing here is transmitted. The link is built and copied entirely in the
// visitor's own browser, and it travels in the URL *fragment* (`#...`), never
// the query string: a fragment is not sent in the request line a server logs,
// nor in a `Referer` header a later click would carry, so a shared quote
// stays off the machines it passes through on the way to the recipient.
//
// The field list mirrors index.html's own `FIELDS` array plus the `stockForm`
// select, which is the one field on this page that is not a plain number.

export const NUMBER_FIELDS = [
  "quantity", "pricePerPart", "setupFeeCharged", "scrapPct",
  "stockUnitCost", "partLengthIn",
  "barLengthIn", "barEndLossIn", "partingAllowanceIn",
  "sheetLengthIn", "sheetWidthIn", "partWidthIn", "nestGapIn",
  "materialCostPerPart",
  "cycleMinutesPerPart", "handlingMinutesPerPart", "machineBurdenPerHour",
  "hourlyWage", "burdenRate", "overheadRate", "targetMargin",
  "setupHours", "programmingHours", "amortiseProgrammingOverParts", "firstArticleHours",
  "toolCostPerCuttingEdge", "partsPerCuttingEdge", "inspectionMinutesPerPart",
  "outsideCostPerPart", "outsideLotMinimum",
];

export const STOCK_FORMS = ["bar", "plate", "supplied"];

// Every field the form owns, numbers first and the select last — what
// `formValues` promises to cover and what check_shared_link_clears.py's
// "every field the form owns" rule is checked against.
export const FIELD_IDS = [...NUMBER_FIELDS, "stockForm"];

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  if (STOCK_FORMS.includes(input?.stockForm)) params.set("stockForm", input.stockForm);
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || "").replace(/^[?#]/, ""));
  const result = {};
  for (const id of NUMBER_FIELDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  const stockForm = params.get("stockForm");
  if (STOCK_FORMS.includes(stockForm)) result.stockForm = stockForm;
  return result;
}

// The supported way to apply a decoded link: every field the form owns gets
// written, so a field the sender left blank is cleared rather than left
// showing whatever the *recipient's own saved draft* put there. Applying a
// decoded link with a plain object spread (`{ ...saved, ...fromLink }`) looks
// like the link wins and is not -- a key fromLink omits still falls through
// to saved's value for that key. See platform/ci/check_shared_link_clears.py.
export function formValues(decoded) {
  const values = Object.fromEntries(
    NUMBER_FIELDS.map((id) => [id, decoded?.[id] !== undefined ? String(decoded[id]) : ""]),
  );
  values.stockForm = STOCK_FORMS.includes(decoded?.stockForm) ? decoded.stockForm : "";
  return values;
}
