/**
 * Size and fit: which size suits a body, and how many of each size to make.
 *
 * Two jobs the interviews asked for ("fitted to the target audience", "trying
 * garments on virtually"), done as arithmetic on tape measurements, no camera
 * and no upload:
 *
 *  1. recommendSize: from chest (and optionally waist, hip, height) pick the
 *     size whose finished garment gives the intended ease, and report the
 *     ease in every size so a shopper sees why.
 *  2. sizeRun: from the audience's average chest and spread, split a
 *     production quantity over sizes (normal curve, largest-remainder
 *     rounding), replacing the fixed default split.
 *
 * The size table is TYPICAL unisex adult body chest circumferences, rounded;
 * it is not any manufacturer's chart and not a standard. A designer replaces
 * it with the chart in their factory's tech pack (`sizeChart` option). Ease
 * values are common trade ranges for knit tops, also typical, not a rule.
 * This is a measurement check, not a drape simulation.
 */
import { SIZES } from "./design.mjs";

/** Body chest circumference in cm that each size is cut for (typical). */
export const BODY_CHEST_CM = Object.freeze({ XS: 84, S: 92, M: 100, L: 108, XL: 116, XXL: 124 });

/** Chest ease in cm (finished garment circumference minus body), by fit. */
export const FIT_EASE_CM = Object.freeze({ slim: 6, regular: 12, relaxed: 18, oversized: 28 });

/** Extra ease a thicker garment needs to sit the same way. */
export const GARMENT_EXTRA_EASE_CM = Object.freeze({ tee: 0, longsleeve: 0, crewneck: 4, hoodie: 8 });

/** Body length (shoulder to hem) in cm at size M, and growth per size step. */
const LENGTH_M = Object.freeze({ tee: 71, longsleeve: 71, crewneck: 68, hoodie: 70 });
const LENGTH_STEP_CM = 2;

export const FIT_LABELS = Object.freeze({ slim: "Slim", regular: "Regular", relaxed: "Relaxed", oversized: "Oversized" });

const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** Finished garment measurements for each size: chest circumference and body length (cm). */
export function garmentMeasurements(garment = "tee", fit = "regular", sizeChart = BODY_CHEST_CM) {
  const ease = (FIT_EASE_CM[fit] ?? FIT_EASE_CM.regular) + (GARMENT_EXTRA_EASE_CM[garment] ?? 0);
  const mi = SIZES.indexOf("M");
  const out = {};
  SIZES.forEach((s, i) => {
    const body = sizeChart[s];
    if (!(body > 0)) return;
    out[s] = {
      size: s,
      bodyChest: body,
      chest: round1(body + ease),
      flatWidth: round1((body + ease) / 2),
      length: round1((LENGTH_M[garment] ?? 70) + (i - mi) * LENGTH_STEP_CM),
    };
  });
  return out;
}

const round1 = x => Math.round(x * 10) / 10;

function easeWord(easeCm, intended) {
  const d = easeCm - intended;
  if (d < -6) return "tight";
  if (d < -2.5) return "snugger than intended";
  if (d <= 2.5) return "as intended";
  if (d <= 8) return "roomier than intended";
  return "much roomier than intended";
}

/**
 * Recommend a size for one body.
 * @param {{chest:number, waist?:number, hip?:number, height?:number}} body  cm
 * @param {{garment?:string, fit?:string, want?:string, sizeChart?:object}} [opts]
 *   `fit` is how the garment is CUT; `want` is the look the wearer is after
 *   (default: the cut's own). Wanting looser than the cut takes a bigger size.
 * @returns {{ok:boolean, error?:string, size?:string, ease?:number, rows?:object[], notes?:string[]}}
 */
export function recommendSize(body, { garment = "tee", fit = "regular", want = fit, sizeChart = BODY_CHEST_CM } = {}) {
  const chest = num(body?.chest, 60, 170);
  if (chest == null) return { ok: false, error: "Enter your chest measurement in cm, between 60 and 170, around the fullest part, tape level." };
  const gm = garmentMeasurements(garment, fit, sizeChart);
  const intended = (FIT_EASE_CM[want] ?? FIT_EASE_CM.regular) + (GARMENT_EXTRA_EASE_CM[garment] ?? 0);
  const rows = SIZES.filter(s => gm[s]).map(s => {
    const ease = round1(gm[s].chest - chest);
    return { ...gm[s], ease, easePct: Math.round((ease / chest) * 100), word: easeWord(ease, intended) };
  });
  // Nearest to intended ease; on a tie take the larger size (a top that is too small cannot be fixed).
  let best = rows[0];
  for (const r of rows) {
    const d = Math.abs(r.ease - intended), bd = Math.abs(best.ease - intended);
    if (d < bd || (d === bd && SIZES.indexOf(r.size) > SIZES.indexOf(best.size))) best = r;
  }
  const notes = [];
  const smallest = rows[0], largest = rows[rows.length - 1];
  if (chest + intended < smallest.chest - 6) notes.push(`Smaller than the smallest size's range: ${smallest.size} will be roomier than intended.`);
  if (best.ease < 0) notes.push("No size fits this chest at all: ask the factory for a larger size.");
  else if (chest > largest.bodyChest + 6) notes.push(`Larger than the biggest size's range: ${largest.size} will fit tighter than intended; ask the factory about extended sizes.`);
  const waist = num(body?.waist, 40, 170), hip = num(body?.hip, 50, 180);
  if (waist != null && waist > chest + 4) notes.push("Waist is larger than chest: a boxier cut or the next size up will hang better over the middle.");
  if (hip != null && hip > chest + 12) notes.push("Hips are well above chest: check the hem width in the factory chart, not only the chest.");
  const height = num(body?.height, 120, 230);
  if (height != null) {
    const wantedLength = round1(height * 0.41);
    const diff = round1(best.length - wantedLength);
    if (diff < -5) notes.push(`Body length ${best.length} cm is short for ${height} cm height; ask for a longer cut.`);
    else if (diff > 8) notes.push(`Body length ${best.length} cm is long for ${height} cm height.`);
  }
  if (want !== fit) notes.push(`This garment is cut ${fit}; for the ${want} look the table picks the size with ${intended} cm of ease.`);
  return { ok: true, size: best.size, ease: best.ease, intended, rows, notes };
}

const erf = x => {
  // Abramowitz-Stegun 7.1.26, absolute error below 1.5e-7.
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const cdf = (x, mean, sd) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));

/**
 * Split `total` pieces over sizes for an audience whose chest circumference
 * is roughly normal with the given mean and standard deviation (cm).
 * Each person buys the size whose body chest is nearest their own chest plus
 * `extraEase` (cm the buyers want beyond the cut: 0 when they want the look
 * the garment is cut for, see fitGap), so size boundaries are midpoints
 * between neighbouring size chests.
 */
export function sizeRun(total, { meanChest = 100, sdChest = 9, extraEase = 0, sizeChart = BODY_CHEST_CM } = {}) {
  const q = Math.max(0, Math.round(Number(total) || 0));
  const mean0 = num(meanChest, 60, 170), mean = mean0 == null ? null : mean0 + (Number(extraEase) || 0), sd = num(sdChest, 2, 30);
  if (mean == null || sd == null) return { ok: false, error: "Mean chest 60 to 170 cm and spread 2 to 30 cm." };
  const present = SIZES.filter(s => sizeChart[s] > 0);
  const bodyAt = s => sizeChart[s];
  const edges = present.map((s, i) => i === present.length - 1 ? Infinity : (bodyAt(s) + bodyAt(present[i + 1])) / 2);
  let prev = -Infinity;
  const shares = present.map((s, i) => { const p = cdf(edges[i], mean, sd) - (prev === -Infinity ? 0 : cdf(prev, mean, sd)); prev = edges[i]; return Math.max(0, p); });
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  const raw = shares.map(p => (p / sum) * q);
  const floor = raw.map(Math.floor);
  let left = q - floor.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - floor[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { floor[i]++; left--; } });
  const sizes = Object.fromEntries(SIZES.map(s => [s, 0]));
  present.forEach((s, i) => { sizes[s] = floor[i]; });
  return { ok: true, sizes, sharePct: Object.fromEntries(present.map((s, i) => [s, Math.round((shares[i] / sum) * 1000) / 10])) };
}

/** Extra ease (cm) buyers want when they like `want` but the garment is cut `cut`; pass to sizeRun. */
export function fitGap(cut = "regular", want = "regular") {
  return (FIT_EASE_CM[want] ?? FIT_EASE_CM.regular) - (FIT_EASE_CM[cut] ?? FIT_EASE_CM.regular);
}
