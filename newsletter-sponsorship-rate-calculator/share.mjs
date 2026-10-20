import { NICHES } from "./calculator.mjs";

/**
 * The inputs a link carries: the three `computeRates` reads.
 *
 * Two of them are numbers and one is an enum, which is why this module cannot
 * be the same shape as the portfolio's all-numeric `share.mjs` modules. The
 * enum is validated against `NICHES` — imported, never restated — so a link
 * carrying an unknown niche falls back to the page's own default rather than
 * putting an unrecognised value into the form and pricing against nothing.
 */
export const NUMERIC_FIELDS = Object.freeze(["subscribers", "openRate"]);
export const SHARE_FIELDS = Object.freeze([...NUMERIC_FIELDS, "niche"]);

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of NUMERIC_FIELDS) {
    // Blank is a real state here: the page opens with both boxes empty and
    // shows its "enter your numbers" prompt rather than a rate card, so a
    // sender who cleared a box should not have it silently refilled.
    if (input?.[field] === "") {
      params.set(field, "");
      continue;
    }
    const value = Number(input?.[field]);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  if (NICHES.includes(input?.niche)) params.set("niche", input.niche);
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || "").replace(/^[?#]/, ""));
  const result = {};
  for (const field of NUMERIC_FIELDS) {
    if (!params.has(field)) continue;
    if (params.get(field) === "") {
      result[field] = "";
      continue;
    }
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  // An unknown niche is dropped rather than carried. The form is a <select>,
  // so writing a value it has no <option> for would leave the control showing
  // its first option while the link claimed another -- the two-people-reading-
  // different-numbers failure this whole module exists to avoid.
  if (NICHES.includes(params.get("niche"))) result.niche = params.get("niche");
  return result;
}

/**
 * Every field the form owns, written whether or not the link carried it, so a
 * box the sender cleared arrives cleared. `niche` falls back to the page's
 * shipped default because a <select> has no blank option to fall back to.
 *
 * See `platform/ci/check_shared_link_clears.py`.
 */
export function formValues(decoded, defaultNiche = NICHES[0]) {
  const values = Object.fromEntries(
    NUMERIC_FIELDS.map(field => [field, decoded?.[field] !== undefined ? String(decoded[field]) : ""]),
  );
  values.niche = NICHES.includes(decoded?.niche) ? decoded.niche : defaultNiche;
  return values;
}
