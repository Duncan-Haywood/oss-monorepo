/**
 * Which items could still be a person's favourite? A credible set for the
 * top (or bottom) item: the fewest items whose posterior chances of being
 * the favourite add up to at least `level`, with each item's chance read off
 * the refit's Gaussian posterior (btRefit.ts, Laplace) by Monte Carlo.
 *
 * Why it exists (docs/INFORMATION-GAIN-SELECTOR.md, "Who it's between"): when
 * the clear-pick rule (clearPick.ts) declines to name a favourite, the
 * insights card says "it's between X, Y, Z". Until 2026-11-12 X, Y, Z were
 * simply the three highest-rated items, a list of fixed length that says
 * nothing about how likely it is to hold the real favourite. This set has a
 * stated chance of holding it instead, and its length says how settled the
 * question is: two names when the answers have nearly decided it, more when
 * they have not.
 *
 * Exactness of the shortcuts: an item more than `prefilterZ` sd of the
 * difference behind the leader has under a 1-in-4,000 chance against the
 * leader alone (z = 3.5), so it is left out of the draws; the marginal of a
 * Gaussian on a subset is the same subset of its mean and covariance, so
 * dropping items does not change the others' joint distribution. Draws come
 * from a fixed seed, so the same answers always give the same card.
 *
 * Pure. Inputs on any one scale (the route passes rating points).
 */

export const FAVOURITE_SET_LEVEL = 0.9;
export const FAVOURITE_SET_DRAWS = 4000;
const PREFILTER_Z = 3.5;

export type FavouriteSet = {
  /** Indices into the input, most likely favourite first. */
  members: number[];
  /** Estimated chance each input item is the favourite (0 for prefiltered items). */
  chance: number[];
  /** Summed chance of the members (at least `level` up to Monte Carlo error). */
  mass: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lower Cholesky factor; adds a small ridge if rounding leaves the matrix just short of positive definite. */
function choleskyPsd(a: Float64Array, n: number): Float64Array {
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, a[i * n + i]);
  for (let ridge = 0, attempt = 0; attempt < 6; attempt++, ridge = scale * 1e-10 * 100 ** attempt) {
    const l = new Float64Array(n * n);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = a[i * n + j] + (i === j ? ridge : 0);
        for (let k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k];
        if (i === j) {
          if (!(s > 0)) { ok = false; break; }
          l[i * n + i] = Math.sqrt(s);
        } else l[i * n + j] = s / l[j * n + j];
      }
    }
    if (ok) return l;
  }
  throw new RangeError("covariance is not positive semi-definite");
}

/**
 * `mean[i]` and the row-major covariance `cov` (n x n) of the items' scores.
 * With `bottom`, the set is for the lowest item instead.
 */
export function favouriteSet(
  mean: readonly number[],
  cov: Float64Array | readonly number[],
  { level = FAVOURITE_SET_LEVEL, draws = FAVOURITE_SET_DRAWS, seed = 0x5eed, bottom = false } = {}
): FavouriteSet {
  const n = mean.length;
  if (cov.length !== n * n) throw new RangeError("cov must be n x n");
  if (!(level > 0 && level <= 1)) throw new RangeError("level must be in (0, 1]");
  if (n === 0) return { members: [], chance: [], mass: 0 };
  const sign = bottom ? -1 : 1;
  const m = mean.map((x) => sign * x);
  let lead = 0;
  for (let i = 1; i < n; i++) if (m[i] > m[lead]) lead = i;
  const keep: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = cov[lead * n + lead] + cov[i * n + i] - 2 * cov[lead * n + i];
    if (i === lead || m[lead] - m[i] <= PREFILTER_Z * Math.sqrt(Math.max(v, 0))) keep.push(i);
  }
  const k = keep.length;
  const chance = new Array<number>(n).fill(0);
  if (k === 1) {
    chance[lead] = 1;
    return { members: [lead], chance, mass: 1 };
  }
  const sub = new Float64Array(k * k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) sub[a * k + b] = cov[keep[a] * n + keep[b]];
  const l = choleskyPsd(sub, k);
  const rand = mulberry32(seed);
  const z = new Float64Array(k);
  const wins = new Array<number>(k).fill(0);
  for (let d = 0; d < draws; d++) {
    for (let a = 0; a < k; a += 2) {
      // Box-Muller, two normals per pair of uniforms.
      const u = 1 - rand(), v = rand();
      const r = Math.sqrt(-2 * Math.log(u));
      z[a] = r * Math.cos(2 * Math.PI * v);
      if (a + 1 < k) z[a + 1] = r * Math.sin(2 * Math.PI * v);
    }
    let best = -1, bestValue = -Infinity;
    for (let a = 0; a < k; a++) {
      let s = m[keep[a]];
      for (let b = 0; b <= a; b++) s += l[a * k + b] * z[b];
      if (s > bestValue) { bestValue = s; best = a; }
    }
    wins[best]++;
  }
  keep.forEach((i, a) => (chance[i] = wins[a] / draws));
  const order = [...keep].sort((x, y) => chance[y] - chance[x] || m[y] - m[x]);
  const members: number[] = [];
  let mass = 0;
  for (const i of order) {
    if (mass >= level) break;
    members.push(i);
    mass += chance[i];
  }
  return { members, chance, mass };
}

/** The level the insights card's "it's between ..." list uses (measured coverage in the doc named above). */
export const CONTENDERS_LEVEL = 0.95;

/**
 * The insights card's contender list: the credible set at `level` for the top
 * (or, with `bottom`, the bottom) item, most likely first, and never fewer
 * than two names (the card is only shown when no single item is clear, so a
 * one-name list would contradict it). `covariance(a, b)` is the posterior
 * covariance of two items' ratings (their variance when a === b).
 */
export function contenders<T extends { rating: number }>(
  items: readonly T[],
  covariance: (a: T, b: T) => number,
  { level = CONTENDERS_LEVEL, bottom = false }: { level?: number; bottom?: boolean } = {}
): T[] {
  const n = items.length;
  const cov = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) cov[i * n + j] = cov[j * n + i] = covariance(items[i], items[j]);
  const set = favouriteSet(items.map((x) => x.rating), cov, { level, bottom });
  const members = [...set.members];
  if (members.length < 2 && n >= 2) {
    const sign = bottom ? -1 : 1;
    const next = items
      .map((x, i) => i)
      .filter((i) => !members.includes(i))
      .sort((a, b) => set.chance[b] - set.chance[a] || sign * (items[b].rating - items[a].rating))[0];
    members.push(next);
  }
  return members.map((i) => items[i]);
}

/**
 * "Still too close to call" with the contender list (lib/favouriteSet.ts):
 * the items that together hold about a 95% chance of being the favourite,
 * most likely first. Long lists name the first three and count the rest, so
 * the card stays short without claiming the list is shorter than it is.
 */
export function contendersLine(rivals: string[]): string {
  const shown = rivals.slice(0, 3);
  const rest = rivals.length - shown.length;
  if (rest > 0) return `Still too close to call — most likely ${shown.join(", ")}, or one of ${rest} more you rated near them.`;
  const list = shown.length === 2 ? shown.join(" and ") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return `Still too close to call — it's between ${list}.`;
}
