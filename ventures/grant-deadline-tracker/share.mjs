// Shareable "cash at risk if this report is late" link. A coordinator who
// has just run the miss/file-yourself/hire-a-writer comparison usually wants
// to hand it to a board member or an executive director next -- the existing
// "Copy a board-ready note" button already assumes that, but it copies a
// static paragraph. A recipient who wants to try their own installment
// figure or clawback percentage has to retype all nine numbers from scratch,
// and a silently dropped field is how they end up looking at a different
// cash-at-risk total than the sender saw. The transform is pure: no DOM, no
// storage, no network, and everything after the # never reaches a server.
//
// Field list mirrors `readRiskInput()` in index.html's own script, not a
// hand-duplicated copy of it -- a field added to that object tomorrow rides
// in the link with no edit here needed beyond adding its id to the list
// below.

/** Every numeric field the "cash at risk" form reads. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'riskAward', 'riskSpent', 'riskInstallment', 'riskRenewal', 'riskClawback',
  'edHours', 'edRate', 'writerHours', 'writerRate',
]);

/** The one date field on the form, an `<input type="date">`. */
export const DATE_FIELD_IDS = Object.freeze(['riskDue']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// Shape-checked rather than calendar-checked: a link carrying "2026-13-40"
// is passed through to calc.mjs's `compareLateReport`, which already treats
// an unparseable due date as "not set" the same way it does one typed by
// hand. This only guards against a fragment that is not a date-shaped
// string at all.
function usableDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : null;
}

/**
 * Encode the risk form's current values as a URL fragment payload.
 *
 * A blank or unusable field is omitted rather than sent as zero (or, for
 * `riskDue`, today's date), so a link built with a field left blank does not
 * silently force a value the sender never chose onto the recipient's page.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of DATE_FIELD_IDS) {
    const value = usableDate(inputs?.[id]);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * thrown on, so a truncated or crafted link still opens the page on the
 * fields that survived. `calc.mjs`'s `compareLateReport` still validates the
 * result on its own terms (for example, rejecting a clawback percent over
 * 100).
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const id of DATE_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableDate(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
