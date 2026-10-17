import { NICHES, FORMATS, USAGE_RIGHTS, EXCLUSIVITY } from "./calculator.mjs";

/**
 * The inputs a link carries: exactly what `computeRate` reads. One number and
 * four enums, each validated against the module that owns them rather than
 * restated here, so a crafted link cannot put an unknown option in a <select>.
 */
export const NUMERIC_FIELDS = Object.freeze(["views"]);
export const ENUM_FIELDS = Object.freeze(["niche", "format", "usage", "exclusivity"]);
export const SHARE_FIELDS = Object.freeze([...NUMERIC_FIELDS, ...ENUM_FIELDS]);

const ENUM_VALUES = { niche: NICHES, format: FORMATS, usage: USAGE_RIGHTS, exclusivity: EXCLUSIVITY };

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of NUMERIC_FIELDS) {
    // Blank is a real state: the page opens empty, so a cleared box stays cleared.
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
  for (const field of ENUM_FIELDS) {
    if (ENUM_VALUES[field].includes(params.get(field))) result[field] = params.get(field);
  }
  return result;
}

/**
 * Every field the form owns, written whether or not the link carried it, so
 * a box the sender cleared arrives cleared. See
 * `platform/ci/check_shared_link_clears.py`.
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
