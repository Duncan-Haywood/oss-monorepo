// Nutrient definitions, unit handling and meal arithmetic.
//
// Every item carries a `source` so a reader can tell a visual estimate from a
// value read off a label or entered by the user (the brief: "Distinguish
// verified nutritional values from visual estimates").

export const NUTRIENTS = [
  { key: "energy_kcal", label: "Energy", unit: "kcal", hk: "dietaryEnergyConsumed", hkUnit: "kcal", required: true },
  { key: "protein_g", label: "Protein", unit: "g", hk: "dietaryProtein", hkUnit: "g", required: true },
  { key: "carbs_g", label: "Carbohydrates", unit: "g", hk: "dietaryCarbohydrates", hkUnit: "g", required: true },
  { key: "fat_g", label: "Total fat", unit: "g", hk: "dietaryFatTotal", hkUnit: "g", required: true },
  { key: "fiber_g", label: "Fiber", unit: "g", hk: "dietaryFiber", hkUnit: "g" },
  { key: "sugar_g", label: "Sugar", unit: "g", hk: "dietarySugar", hkUnit: "g" },
  { key: "sat_fat_g", label: "Saturated fat", unit: "g", hk: "dietaryFatSaturated", hkUnit: "g" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", hk: "dietarySodium", hkUnit: "mg" },
];
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
export const CORE_KEYS = NUTRIENTS.filter((n) => n.required).map((n) => n.key);

export const ITEM_SOURCES = ["estimate", "label", "reference", "user", "chat_estimate"];

const round = (x, dp = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** dp) / 10 ** dp);

export function cleanNutrients(n = {}) {
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    const v = Number(n[k]);
    if (n[k] != null && n[k] !== "" && Number.isFinite(v) && v >= 0) out[k] = round(v, k === "energy_kcal" || k === "sodium_mg" ? 0 : 1);
  }
  return out;
}

export function scaleNutrients(n, factor) {
  const out = {};
  for (const [k, v] of Object.entries(n || {})) out[k] = round(v * factor, k === "energy_kcal" || k === "sodium_mg" ? 0 : 1);
  return out;
}

export function sumNutrients(list) {
  const out = {};
  for (const n of list) for (const [k, v] of Object.entries(n || {})) if (v != null) out[k] = (out[k] || 0) + v;
  for (const k of Object.keys(out)) out[k] = round(out[k], k === "energy_kcal" || k === "sodium_mg" ? 0 : 1);
  return out;
}

export function mealTotals(items) {
  const totals = sumNutrients(items.map((i) => i.nutrients));
  // Uncertainty band on energy: each estimated item contributes its own range,
  // or a default +/- band scaled by its confidence. Label/user values count as exact.
  let lo = 0;
  let hi = 0;
  for (const i of items) {
    const e = i.nutrients?.energy_kcal || 0;
    if (Array.isArray(i.energy_range) && i.energy_range.length === 2) {
      lo += i.energy_range[0];
      hi += i.energy_range[1];
    } else if (i.source === "estimate" || i.source === "chat_estimate") {
      const band = 0.15 + 0.35 * (1 - (i.confidence ?? 0.5)); // 15% at full confidence, 50% at zero
      lo += e * (1 - band);
      hi += e * (1 + band);
    } else {
      lo += e;
      hi += e;
    }
  }
  return { ...totals, energy_kcal_range: [Math.round(lo), Math.round(hi)] };
}

/**
 * Atwater check: 4 kcal/g protein, 4 kcal/g carbohydrate, 9 kcal/g fat. A
 * stated energy far from the macro-implied energy means the estimate is
 * internally inconsistent (fiber and alcohol explain small gaps).
 */
export function atwaterGap(n) {
  if (!n || n.energy_kcal == null) return null;
  const implied = 4 * (n.protein_g || 0) + 4 * (n.carbs_g || 0) + 9 * (n.fat_g || 0);
  if (implied === 0 && n.energy_kcal === 0) return 0;
  const denom = Math.max(n.energy_kcal, implied, 1);
  return Math.abs(n.energy_kcal - implied) / denom;
}

// ---------------------------------------------------------------- units

const MASS = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125, lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237, mg: 0.001 };
const VOLUME_ML = { ml: 1, l: 1000, tsp: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892, tbsp: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868, cup: 236.588, cups: 236.588, floz: 29.5735, "fl oz": 29.5735 };
const COUNT = new Set(["each", "piece", "pieces", "whole", "item", "items", "x", "", "count", "large", "egg", "eggs", "slice", "slices"]);

/**
 * Convert an amount to grams. Volumes need a density (g/ml): taken from the
 * reference food when known, else water (1 g/ml). Counts need grams_per_each.
 * Returns { grams, assumption } or throws with a message a chat model can relay.
 */
export function toGrams(amount, { density = null, gramsPerEach = null } = {}) {
  if (amount == null) throw new Error("amount is required");
  if (typeof amount === "number") return { grams: amount, assumption: null };
  const value = Number(amount.value);
  if (!Number.isFinite(value) || value < 0) throw new Error("amount.value must be a non-negative number");
  const unit = String(amount.unit ?? "g").trim().toLowerCase().replace(/\.$/, "");
  if (unit in MASS) return { grams: value * MASS[unit], assumption: null };
  if (unit in VOLUME_ML) {
    const d = density ?? 1;
    return { grams: value * VOLUME_ML[unit] * d, assumption: density ? null : "volume converted at water density (1 g/ml)" };
  }
  if (COUNT.has(unit)) {
    if (!gramsPerEach) throw new Error(`cannot convert a count of "${unit}" to grams for this food; give a weight`);
    return { grams: value * gramsPerEach, assumption: `${gramsPerEach} g each` };
  }
  throw new Error(`unknown unit "${amount.unit}"; use g, kg, oz, lb, ml, tsp, tbsp, cup or each`);
}

// ---------------------------------------------------------------- reference foods
//
// A deliberately small table of staple foods, per 100 g, rounded from USDA
// FoodData Central (SR Legacy) entries. It exists so common chat corrections
// ("add three eggs", "two tablespoons of olive oil") resolve without another
// model call. Anything not here falls through to the analyzer or to values the
// caller supplies. Verify against fdc.nal.usda.gov before relying on a value.
export const REFERENCE_FOODS = [
  { key: "olive oil", aliases: ["extra virgin olive oil", "evoo", "oil"], density: 0.91, per100g: { energy_kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100, sat_fat_g: 13.8, sodium_mg: 2 } },
  { key: "butter", aliases: ["salted butter"], density: 0.96, per100g: { energy_kcal: 717, protein_g: 0.9, carbs_g: 0.1, fat_g: 81.1, sat_fat_g: 51.4, sodium_mg: 643 } },
  { key: "egg", aliases: ["eggs", "whole egg", "large egg", "large eggs", "whole eggs"], gramsPerEach: 50, per100g: { energy_kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, sat_fat_g: 3.1, sodium_mg: 142 } },
  { key: "egg white", aliases: ["egg whites"], gramsPerEach: 33, per100g: { energy_kcal: 52, protein_g: 10.9, carbs_g: 0.7, fat_g: 0.2, sodium_mg: 166 } },
  { key: "chicken breast, cooked", aliases: ["chicken breast", "grilled chicken", "roast chicken breast", "chicken"], per100g: { energy_kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, sat_fat_g: 1, sodium_mg: 74 } },
  { key: "white rice, cooked", aliases: ["rice", "white rice", "cooked rice"], per100g: { energy_kcal: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3, fiber_g: 0.4, sodium_mg: 1 } },
];

export function findReference(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  return REFERENCE_FOODS.find((r) => r.key === n || r.aliases.includes(n)) || null;
}

export function referenceItem(name, amount) {
  const ref = findReference(name);
  if (!ref) return null;
  const { grams, assumption } = toGrams(amount, { density: ref.density, gramsPerEach: ref.gramsPerEach });
  return {
    name: ref.key,
    grams: round(grams, 0),
    source: "reference",
    confidence: 0.9,
    nutrients: cleanNutrients(scaleNutrients(ref.per100g, grams / 100)),
    note: ["USDA SR Legacy reference values", assumption].filter(Boolean).join("; "),
  };
}

// ---------------------------------------------------------------- time

/** Local calendar date (YYYY-MM-DD) of an instant, by IANA zone if given, else by fixed offset. */
export function localDate(instantIso, { timeZone = null, offsetMin = 0 } = {}) {
  const d = new Date(instantIso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${instantIso}`);
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      /* unknown zone: fall back to the offset */
    }
  }
  return new Date(d.getTime() + offsetMin * 60000).toISOString().slice(0, 10);
}

export function offsetMinutesIn(timeZone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(instant);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = tz.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

export { round };
