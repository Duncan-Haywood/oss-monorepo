/**
 * Fabric shrinkage allowance. A designer washes a marked swatch (or a sample
 * piece), measures the marked distance before and after, and this turns the
 * readings into the percentage shrunk in each direction, the size to cut so
 * the washed garment lands on its spec, and the extra cloth that costs.
 *
 * Shrinkage % = (before - after) / before x 100; negative means the cloth grew.
 * Cut size = finished size / (1 - shrinkage), applied per direction.
 * Cloth bought = nominal cloth x 1 / ((1 - length) x (1 - width)), an area rule
 * that ignores marker packing. Readings are the designer's own; no test method
 * or limit is assumed, so check the method and any limit in your contract.
 */
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/** One reading: marked distance before and after washing, same unit. Returns a fraction (0.05 = 5%). */
export function shrinkage(before, after) {
  num(before, "Before", 1e-9, 1e6); num(after, "After", 1e-9, 1e6);
  return (before - after) / before;
}

/** Average a list of {before, after} readings; spread is max - min of the fractions. */
export function summarise(readings) {
  if (!Array.isArray(readings) || readings.length === 0) throw new Error("Add at least one reading.");
  const f = readings.map(r => shrinkage(r.before, r.after));
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  if (mean >= 0.5 || mean <= -0.3) throw new Error("Average shrinkage must be between -30% and 50%; check the before and after figures.");
  return { n: f.length, mean, min: Math.min(...f), max: Math.max(...f), spread: Math.max(...f) - Math.min(...f) };
}

/** Size to cut so the washed piece measures `finished`. `dir` is "length" or "width". */
export function cutSize(finished, dir, shrink) {
  num(finished, "Finished size", 1e-9, 1e6);
  if (dir !== "length" && dir !== "width") throw new Error('Direction must be "length" or "width".');
  const s = dir === "length" ? shrink.length : shrink.width;
  num(s, "Shrinkage", -0.3, 0.5);
  const cut = finished / (1 - s);
  return { cut, ifIgnored: finished * (1 - s), shortBy: finished - finished * (1 - s) };
}

/** Extra cloth: factor to multiply cloth per garment by, and the cost of it. */
export function clothUplift({ length, width, clothPerGarment = 0, pricePerUnit = 0, garments = 0 }) {
  num(length, "Length shrinkage", -0.3, 0.5); num(width, "Width shrinkage", -0.3, 0.5);
  const factor = 1 / ((1 - length) * (1 - width));
  const perGarment = clothPerGarment * (factor - 1);
  return { factor, extraPct: (factor - 1) * 100, extraPerGarment: perGarment, extraCostPerGarment: perGarment * pricePerUnit, extraCostRun: perGarment * pricePerUnit * garments };
}

/** Plain-language notes about the readings. */
export function notes(sum, label) {
  const out = [];
  if (sum.n < 3) out.push(`${label}: only ${sum.n} reading${sum.n === 1 ? "" : "s"}; three or more swatches show how much the cloth varies.`);
  if (sum.spread > 0.02) out.push(`${label}: readings differ by ${(sum.spread * 100).toFixed(1)} points; the average may not hold across the roll.`);
  if (sum.mean > 0.05) out.push(`${label}: ${(sum.mean * 100).toFixed(1)}% is a lot of shrinkage; ask the mill about pre-shrunk or compacted cloth, or wash more than once to see if it keeps shrinking.`);
  if (sum.mean < 0) out.push(`${label}: the cloth grew, so the cut is smaller than the finished size.`);
  return out;
}
