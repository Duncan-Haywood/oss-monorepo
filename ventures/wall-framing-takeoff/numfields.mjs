// A number given as text ("12") passes a `>=` range check by coercion and then
// misbehaves later. These settings validators call this first.
/** @param {any} d @param {string[]} keys @returns {string[]} */
export function textNumberErrors(d, keys) {
  const e = [];
  for (const k of keys) if (d[k] != null && (typeof d[k] !== "number" || !Number.isFinite(d[k]))) e.push(`${k} must be a number.`);
  return e;
}
