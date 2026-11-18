// A number given as text ("12") passes a `>=` range check by coercion and then
// misbehaves later. These settings validators call this first.
/** @param {any} d @param {string[]} keys @returns {string[]} */
export function textNumberErrors(d, keys) {
  const e = [];
  // A missing or non-object settings value has no fields to check; callers refuse it themselves.
  if (d === null || typeof d !== "object") return e;
  for (const k of keys) {
    if (d[k] == null) continue;
    if (typeof d[k] !== "number" || !Number.isFinite(d[k])) e.push(`${k} must be a number.`);
    // A price below 0 gave a negative cost line; 1e9 is a guard limit, not a price rule.
    else if (/price$/i.test(k) && (d[k] < 0 || d[k] > 1e9)) e.push(`${k} must be from 0 to 1,000,000,000.`);
  }
  return e;
}
