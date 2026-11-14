/**
 * Inks chosen for the dither (index separation), not for flat areas.
 *
 * The flat separation picks its inks as cluster centres (`separation.mjs`): each ink is the average colour of
 * the area it will fill. That is right when an area is printed solid, and wrong for dots. Error diffusion mixes
 * neighbouring dots by area in linear light, so the colours an index print can reach are exactly the convex hull
 * of its inks and the bare garment in linear RGB. Cluster centres sit inside the painting's colours, so their hull
 * leaves out the painting's darkest, lightest and most saturated passages, and the dither has to clamp them.
 *
 * `fitIndexInks` moves the inks so that hull covers the painting's colours: it minimises the mean CIE76 distance
 * from each sampled painting colour to the nearest colour the dots can mix (its projection onto the hull), with a
 * small `grain` term for the distance to the nearest single ink (far-apart inks give coarser-looking dots).
 * Search: pattern search on each ink in sRGB, steps from 0.25 to 0.01, kept inside 0..255. Projection onto the
 * hull: Frank-Wolfe on the simplex weights, warm-started per sample.
 *
 * `chooseIndexInks` then runs the real index separation with each candidate ink set (the flat inks and fits with
 * a few grain weights) and keeps the one the eye model in `indexsep.mjs` puts closest to the painting at the
 * chosen viewing distance. The flat inks are always a candidate, so the choice is never worse than them on that
 * measure. Earlier tries that did not work (README, "Index separation"): refitting inks to what the dither asked
 * of them diverged, and pushing them outward from the mean helped only at 3 m.
 *
 * Pure functions; no DOM.
 */
import { toLab } from "./separation.mjs";
import { indexSeparate, perceivedDeltaE, sigmaAt } from "./indexsep.mjs";

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexOf = rgb => "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const labOfLin = ([r, g, b]) => toLab(unlin(Math.max(0, Math.min(1, r))), unlin(Math.max(0, Math.min(1, g))), unlin(Math.max(0, Math.min(1, b))));

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Mixing weights for x over the palette pts (linear RGB triples): minimises
 *   |P w - x|^2 + lambda * (sum_j w_j |p_j|^2 - |P w|^2)
 * over the simplex, i.e. the mixed colour's error plus lambda times the variance of the dots around it (how
 * grainy that mixture looks). lambda 0 is plain projection onto the hull; lambda < 1 keeps it convex.
 * Frank-Wolfe with exact line search; w (length pts.length) is updated in place as a warm start. Returns P w.
 */
export function mixWeights(x, pts, w, lambda = 0, iters = 40) {
  const m = pts.length, p = [0, 0, 0], n2 = pts.map(q => q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
  const lam = Math.max(0, Math.min(0.95, lambda));
  for (let j = 0; j < m; j++) for (let k = 0; k < 3; k++) p[k] += w[j] * pts[j][k];
  for (let it = 0; it < iters; it++) {
    // gradient wrt w_j: 2 p_j.(Pw - x) + lam (|p_j|^2 - 2 p_j.Pw); pairwise step: weight moves from the worst
    // vertex in use (a) to the best (s), which converges on hull faces where plain Frank-Wolfe zig-zags
    const g = [p[0] - x[0], p[1] - x[1], p[2] - x[2]];
    let s = 0, best = Infinity, a = -1, worst = -Infinity;
    for (let j = 0; j < m; j++) {
      const q = pts[j], dot = q[0] * g[0] + q[1] * g[1] + q[2] * g[2], dp = q[0] * p[0] + q[1] * p[1] + q[2] * p[2];
      const v = 2 * dot + lam * (n2[j] - 2 * dp);
      if (v < best) { best = v; s = j; }
      if (w[j] > 1e-12 && v > worst) { worst = v; a = j; }
    }
    if (a < 0 || worst - best < 1e-12) break; // optimal: every vertex in use is as good as the best
    const d = [pts[s][0] - pts[a][0], pts[s][1] - pts[a][1], pts[s][2] - pts[a][2]];
    const curv = (1 - lam) * (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    // along w + t (e_s - e_a): slope best - worst, curvature 2 curv
    const t = curv > 1e-16 ? Math.min(w[a], (worst - best) / (2 * curv)) : w[a];
    if (t < 1e-12) break;
    w[a] -= t; w[s] += t;
    for (let k = 0; k < 3; k++) p[k] += t * d[k];
  }
  return p;
}

/** Closest point to x in the convex hull of pts (mixWeights with no grain term). */
export const hullProject = (x, pts, w, iters = 40) => mixWeights(x, pts, w, 0, iters);

/**
 * How much grain counts at a viewing distance: the dots' variance is averaged over the eye's blur, a Gaussian of
 * sigma cells, which divides white noise's variance by about 4 pi sigma^2. Error diffusion's noise is mostly at
 * high frequencies (blue noise), so it is divided further; `kappa` (default 0.5) is that factor, tuned on the
 * paintings (README).
 */
export const grainWeight = (sigmaCells, kappa = 0.5) => Math.min(0.95, kappa / (4 * Math.PI * Math.max(0.05, sigmaCells) ** 2));

/** Up to n linear-RGB samples of the printed area of an index grid (`src` triples, `skip(i)` true for background). */
export function sampleColours(src, cells, skip = () => false, n = 1500, seed = 7) {
  const r = rng(seed), out = [];
  const idx = [];
  for (let i = 0; i < cells; i++) if (!skip(i)) idx.push(i);
  if (!idx.length) return out;
  const take = Math.min(n, idx.length);
  for (let t = 0; t < take; t++) {
    const i = idx.length <= n ? idx[t] : idx[Math.floor(r() * idx.length)];
    out.push([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]);
  }
  return out;
}

/**
 * Predicted error of dotting `samples` with these inks: per sample, the mixture from `mixWeights`, then
 * sqrt(bias^2 + lambda * spread^2) in CIE Lab, where bias is the mixed colour's distance from the sample and spread
 * the weighted distance of the dots' own colours from the mix. Mean over samples.
 */
export function mixCost(samples, inksLin, garmentLin, { lambda = 0, weights = null, labs = null } = {}) {
  const pts = [...inksLin, garmentLin], m = pts.length;
  const pl = pts.map(labOfLin);
  let s = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    let w = weights && weights[i];
    if (!w || w.length !== m) { w = new Float64Array(m).fill(1 / m); if (weights) weights[i] = w; }
    const p = mixWeights(x, pts, w, lambda);
    const L = labs ? labs[i] : labOfLin(x), q = labOfLin(p);
    const bias2 = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2;
    let v = 0;
    if (lambda) for (let j = 0; j < m; j++) if (w[j] > 1e-6) v += w[j] * ((pl[j][0] - q[0]) ** 2 + (pl[j][1] - q[1]) ** 2 + (pl[j][2] - q[2]) ** 2);
    s += Math.sqrt(bias2 + lambda * v);
  }
  return s / Math.max(1, samples.length);
}

/**
 * Inks moved so the dots can mix the painting's colours.
 * @param samples linear-RGB triples of the painting (see `sampleColours`)
 * @param inkHexes the starting inks (normally the flat separation's), in print order
 * @param garmentHex the garment colour (fixed: it is the cloth)
 * @param o { lambda: grain weight from `grainWeight` (default 0: coverage only), steps (sRGB 0..1 step sizes) }
 * Returns { inks: hex[], cost, startCost, evaluations }.
 */
export function fitIndexInks(samples, inkHexes, garmentHex, o = {}) {
  const lambda = Number(o.lambda ?? 0);
  const steps = o.steps || [0.25, 0.12, 0.06, 0.03, 0.01];
  const g = rgbOf(garmentHex).map(lin);
  const labs = samples.map(labOfLin);
  const weights = [];
  let cur = inkHexes.map(h => rgbOf(h).map(v => v / 255)); // sRGB 0..1
  const toLin = arr => arr.map(c => c.map(v => lin(v * 255)));
  const cost = arr => mixCost(samples, toLin(arr), g, { lambda, weights, labs });
  const startCost = cost(cur);
  let best = startCost, evaluations = 1;
  for (const st of steps) {
    let improved = true, rounds = 0;
    while (improved && rounds++ < 12) {
      improved = false;
      for (let j = 0; j < cur.length; j++) for (let k = 0; k < 3; k++) for (const sgn of [1, -1]) {
        const v = Math.max(0, Math.min(1, cur[j][k] + sgn * st));
        if (v === cur[j][k]) continue;
        const trial = cur.map(c => c.slice()); trial[j][k] = v;
        const c = cost(trial); evaluations++;
        if (c < best - 1e-6) { best = c; cur = trial; improved = true; }
      }
    }
  }
  return { inks: cur.map(c => hexOf(c.map(v => v * 255))), cost: +best.toFixed(3), startCost: +startCost.toFixed(3), evaluations };
}

/** Kappas tried by `chooseIndexInks` (grain weights; see `grainWeight`). */
export const KAPPAS = [0.25, 0.5, 1];

/**
 * Inks for an index print seen from `metres`: the flat inks and a fit per kappa, each dotted with the real index
 * separation and scored by the eye model at that distance; the closest wins (ties keep the flat inks).
 * @param image, base, o as for `indexSeparate` (o.crop, o.dotGainPct, o.minFeatureMm pass through)
 * @param o.metres viewing distance to choose for (default 1)
 * Returns { inks: hex[] (best), refit: boolean, metres, candidates: [{ label, inks, deltaE }], idx (the winning index separation) }.
 */
export function chooseIndexInks(image, base, o = {}) {
  const metres = Number(o.metres) > 0 ? Number(o.metres) : 1;
  const kappas = o.kappas || KAPPAS;
  const flat = indexSeparate(image, base, { ...o, inks: undefined });
  const sigmaMm = sigmaAt(metres);
  const score = idx => perceivedDeltaE(idx, idx.labels, sigmaMm, idx.dotGainPct);
  const samples = sampleColours(flat.src, flat.width * flat.height, i => flat.labels[i] === 255, o.samples || 1500);
  const flatHex = base.inks.map(i => i.hex);
  const candidates = [{ label: "flat inks", inks: flatHex, deltaE: score(flat), idx: flat }];
  if (samples.length && flatHex.length) for (const kappa of kappas) {
    const fit = fitIndexInks(samples, flatHex, base.garment, { lambda: grainWeight(sigmaMm / flat.dotMm, kappa) });
    if (fit.inks.every((h, p) => h === flatHex[p]) || candidates.some(c => c.inks.join() === fit.inks.join())) continue;
    const idx = indexSeparate(image, base, { ...o, inks: fit.inks });
    candidates.push({ label: `fitted, grain weight ${kappa}`, inks: fit.inks, deltaE: score(idx), idx });
  }
  let best = candidates[0];
  for (const c of candidates) if (c.deltaE < best.deltaE - 0.005) best = c;
  return { inks: best.inks, refit: best !== candidates[0], metres, candidates: candidates.map(({ label, inks, deltaE }) => ({ label, inks, deltaE })), idx: best.idx };
}
