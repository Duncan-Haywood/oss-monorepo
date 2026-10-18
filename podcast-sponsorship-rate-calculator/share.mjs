import { NICHES, READ_TYPES } from "./calculator.mjs";

/**
 * The inputs a link carries: the three `computeRates` reads.
 *
 * One field is a number and two are enums, each validated against the
 * module that owns them (`NICHES`, `READ_TYPES`) rather than restated here,
 * so a link carrying an unknown value falls back to the page's own default
 * instead of putting an unrecognised option into a <select> and pricing
 * against nothing.
 */
export const NUMERIC_FIELDS = Object.freeze(["downloads"]);
export const ENUM_FIELDS = Object.freeze(["niche", "readType"]);
export const SHARE_FIELDS = Object.freeze([...NUMERIC_FIELDS, ...ENUM_FIELDS]);

const ENUM_VALUES = { niche: NICHES, readType: READ_TYPES };

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of NUMERIC_FIELDS) {
    // Blank is a real state here: the page opens with the box empty and
    // shows its "enter your downloads" prompt rather than a rate card, so a
    // sender who cleared the box should not have it silently refilled.
    if (input?.[field] === "") {
      params.set(field, "");
      continue;
    }
    const value = Number(input?.[field]);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  for (const field of ENUM_FIELDS) {
    if (ENUM_VALUES[field].includes(input?.[field])) params.set(field, input[field]);
  }
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
  // An unknown enum value is dropped rather than carried. Each form field is
  // a <select>, so writing a value it has no <option> for would leave the
  // control showing its first option while the link claimed another -- the
  // two-people-reading-different-numbers failure this module exists to avoid.
  for (const field of ENUM_FIELDS) {
    if (ENUM_VALUES[field].includes(params.get(field))) result[field] = params.get(field);
  }
  return result;
}

/**
 * Every field the form owns, written whether or not the link carried it, so
 * a box the sender cleared arrives cleared. The enum fields fall back to the
 * page's shipped defaults because a <select> has no blank option to fall
 * back to.
 *
 * See `platform/ci/check_shared_link_clears.py`.
 */
export function formValues(decoded, defaults = {}) {
  const values = Object.fromEntries(
    NUMERIC_FIELDS.map((field) => [field, decoded?.[field] !== undefined ? String(decoded[field]) : ""]),
  );
  for (const field of ENUM_FIELDS) {
    const fallback = defaults[field] ?? ENUM_VALUES[field][0];
    values[field] = ENUM_VALUES[field].includes(decoded?.[field]) ? decoded[field] : fallback;
  }
  return values;
}
