/**
 * Inks for the dots picked from what the printer already stocks.
 *
 * `inkfit.mjs` moves the inks freely, so every ink it picks is a custom mix the printer has to match, and shops
 * charge for each colour they mix to a sample. A shop that prints index separations usually has a shelf of ready
 * inks instead. `chooseStockInks` picks, from that shelf, as many inks as the flat separation has screens, so the
 * dots get as close to the painting as the stock allows, with no mixing at all.
 *
 * Method. Which colours an error-diffusion print can reach is the convex hull of its inks and the bare garment in
 * linear RGB (inkfit.mjs), so a subset is scored by `mixCost`: the mean Lab distance from sampled painting colours
 * to what the dots can mix, plus the grain term for far-apart inks at the viewing distance. Search over subsets of
 * the stock: two starts (each flat ink's nearest stock ink, and greedy forward selection: add whichever ink lowers
 * the cost most), each followed by swap descent (replace one chosen ink with one unchosen while the cost falls).
 * The chosen inks are then put in the flat inks' print order by the assignment that keeps each screen closest in
 * Lab to the flat ink it replaces. Every distinct candidate subset (the two searches and the naive "nearest stock
 * ink to each flat ink", the pick a person would make by eye) is then dotted with the real index separation and
 * scored by the eye model of `indexsep.mjs` at the chosen distance; the closest wins. So the result is never worse
 * on that measure than matching each flat ink to its nearest stock ink.
 *
 * `STARTER_STOCK` is a made-up shelf of common screen-printing colour names with approximate sRGB values, so the
 * page works before a printer's list is pasted. It is not any ink maker's swatch book; real inks differ, and the
 * printer's own list (their names and measured or quoted colours) is what to use.
 *
 * Pure functions; no DOM.
 */
import { toLab } from "./separation.mjs";
import { indexSeparate, perceivedDeltaE, sigmaAt } from "./indexsep.mjs";
import { mixCost, grainWeight, sampleColours } from "./inkfit.mjs";

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const labOf = hex => toLab(...rgbOf(hex));
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** A made-up starter shelf: common colour names, approximate colours. Not a maker's swatches (see above). */
export const STARTER_STOCK = [
  ["White", "#f4f4f0"], ["Black", "#1b1b1b"], ["Lemon yellow", "#f3e300"], ["Golden yellow", "#f5b300"],
  ["Orange", "#f06a1e"], ["Burnt orange", "#b4521e"], ["Scarlet", "#d6262f"], ["Maroon", "#6e1d2b"],
  ["Magenta", "#c4167f"], ["Pink", "#f2a2bf"], ["Purple", "#5a2a85"], ["Royal blue", "#1f3f98"],
  ["Navy", "#1d2948"], ["Cyan", "#0098d5"], ["Sky blue", "#7db5df"], ["Turquoise", "#00a19f"],
  ["Kelly green", "#00863d"], ["Forest green", "#24523a"], ["Lime", "#8cc540"], ["Olive", "#6a6a2c"],
  ["Brown", "#593922"], ["Tan", "#c8a67b"], ["Cream", "#eee5ce"], ["Light grey", "#c6c8c7"], ["Grey", "#898c8e"],
].map(([name, hex]) => ({ name, hex }));

/**
 * A printer's stock list, one ink per line: a name and a colour, in either order, separated by commas, tabs,
 * semicolons or spaces. The colour is #RRGGBB (or RRGGBB, or #RGB; three bare digits are not read as a colour, so "Red 185" needs one) or three 0-255 numbers. Blank lines and lines
 * starting with # followed by a space are skipped. Duplicate colours are kept once (first name wins).
 * Returns { inks: [{ name, hex }], errors: [{ line, text, reason }] }.
 */
export function parseStockList(text) {
  const inks = [], errors = [], seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, n) => {
    const s = raw.trim();
    if (!s || /^#\s/.test(s) || /^\/\//.test(s)) return;
    let hex = null, name = s;
    const m = s.match(/(^|[\s,;\t])#([0-9a-f]{6}|[0-9a-f]{3})(?=$|[\s,;\t])/i) || s.match(/(^|[\s,;\t])()([0-9a-f]{6})(?=$|[\s,;\t])/i);
    const rgb = s.match(/(^|[\s,;\t(])(\d{1,3})[\s,;]+(\d{1,3})[\s,;]+(\d{1,3})(?=$|[\s,;\t)])/);
    if (m && (m[0].includes("#") || !rgb)) {
      const raw6 = m[3] || m[2], h = raw6.length === 3 ? raw6.split("").map(c => c + c).join("") : raw6;
      hex = "#" + h.toLowerCase(); name = s.replace(m[0], m[1]);
    } else if (rgb) {
      const v = [rgb[2], rgb[3], rgb[4]].map(Number);
      if (v.some(x => x > 255)) { errors.push({ line: n + 1, text: s, reason: "RGB values go from 0 to 255" }); return; }
      hex = "#" + v.map(x => x.toString(16).padStart(2, "0")).join(""); name = s.replace(rgb[0], rgb[1]);
    }
    if (!hex) { errors.push({ line: n + 1, text: s, reason: "no colour found (use #RRGGBB or three numbers 0-255)" }); return; }
    name = name.replace(/rgb\(\s*\)/i, "").replace(/^[\s,;\t:=-]+|[\s,;\t:=-]+$/g, "").replace(/\s+/g, " ") || hex;
    if (seen.has(hex)) return;
    seen.add(hex); inks.push({ name, hex });
  });
  return { inks, errors };
}

/** Index of each flat ink's nearest stock ink (Lab), without repeats: closest pairs taken first. */
export function nearestStock(flatHexes, stockHexes) {
  const fl = flatHexes.map(labOf), sl = stockHexes.map(labOf), pairs = [];
  fl.forEach((f, i) => sl.forEach((s, j) => pairs.push([d2(f, s), i, j])));
  pairs.sort((a, b) => a[0] - b[0]);
  const out = new Array(fl.length).fill(-1), used = new Set();
  for (const [, i, j] of pairs) if (out[i] < 0 && !used.has(j)) { out[i] = j; used.add(j); }
  return out;
}

/**
 * Chosen stock inks (indices) put in the flat inks' print positions: the permutation with the smallest total Lab
 * distance to the flat inks (exhaustive up to 7 inks, greedy closest-pair beyond).
 */
export function assignToScreens(flatHexes, stockHexes, chosen) {
  const fl = flatHexes.map(labOf), cl = chosen.map(j => labOf(stockHexes[j])), k = chosen.length;
  if (k > 7) {
    const order = nearestStock(flatHexes, chosen.map(j => stockHexes[j]));
    return order.map(p => chosen[p]);
  }
  let best = null, bestCost = Infinity;
  const perm = [], used = new Array(k).fill(false);
  (function rec(i, acc) {
    if (acc >= bestCost) return;
    if (i === k) { bestCost = acc; best = perm.slice(); return; }
    for (let p = 0; p < k; p++) if (!used[p]) { used[p] = true; perm[i] = p; rec(i + 1, acc + d2(fl[i], cl[p])); used[p] = false; }
  })(0, 0);
  return best.map(p => chosen[p]);
}

/**
 * Subset search on the proxy cost: k inks from the stock (linear RGB in `stockLin`) for these samples.
 * Returns { greedy: { set, cost }, fromNearest: { set, cost }, evaluations }.
 */
export function searchStock(samples, stockLin, garmentLin, k, start, { lambda = 0 } = {}) {
  const labs = samples.map(s => toLab(...s.map(v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))));
  let evaluations = 0;
  const memo = new Map();
  const cost = set => {
    const key = set.slice().sort((a, b) => a - b).join(",");
    if (memo.has(key)) return memo.get(key);
    evaluations++;
    const c = mixCost(samples, set.map(j => stockLin[j]), garmentLin, { lambda, labs });
    memo.set(key, c); return c;
  };
  const n = stockLin.length;
  const descend = set => {
    let cur = set.slice(), c = cost(cur), improved = true;
    while (improved) {
      improved = false;
      for (let p = 0; p < cur.length && !improved; p++) for (let j = 0; j < n; j++) {
        if (cur.includes(j)) continue;
        const t = cur.slice(); t[p] = j;
        const tc = cost(t);
        if (tc < c - 1e-6) { cur = t; c = tc; improved = true; break; }
      }
    }
    return { set: cur, cost: +c.toFixed(3) };
  };
  const g = [];
  while (g.length < k) {
    let bj = -1, bc = Infinity;
    for (let j = 0; j < n; j++) if (!g.includes(j)) { const c = cost([...g, j]); if (c < bc) { bc = c; bj = j; } }
    g.push(bj);
  }
  const greedy = descend(g), fromNearest = descend(start);
  return { greedy, fromNearest, evaluations };
}

/**
 * Inks for an index print from the printer's stock, seen from `metres`.
 * @param image, base as for `indexSeparate`; o.crop, o.dotGainPct, o.minFeatureMm pass through
 * @param stock [{ name, hex }] (e.g. `parseStockList(text).inks`, or `STARTER_STOCK`); needs at least as many inks as screens
 * @param o.metres viewing distance to choose for (default 1); o.samples (default 800); o.kappa grain factor (default 0.5)
 * Returns { inks: hex[] in print order, names: string[], metres, candidates: [{ label, inks, names, deltaE }],
 *           nearestDeltaE (the nearest-stock pick), gain (nearest minus chosen), idx (winning index separation), evaluations }.
 */
export function chooseStockInks(image, base, stock, o = {}) {
  const list = (stock || []).filter(s => s && /^#[0-9a-f]{6}$/i.test(s.hex || "")).map(s => ({ name: String(s.name || s.hex), hex: s.hex.toLowerCase() }));
  const k = base.inks.length;
  if (list.length < k) throw new Error(`The stock list has ${list.length} usable inks; this separation needs ${k}. Add inks or lower the colour count.`);
  const metres = Number(o.metres) > 0 ? Number(o.metres) : 1;
  const ixo = { crop: o.crop, dotGainPct: o.dotGainPct, minFeatureMm: o.minFeatureMm };
  const sigmaMm = sigmaAt(metres);
  const flatHex = base.inks.map(i => i.hex), stockHex = list.map(s => s.hex);
  const near = nearestStock(flatHex, stockHex);
  const first = indexSeparate(image, base, { ...ixo, inks: near.map(j => stockHex[j]) });
  const samples = sampleColours(first.src, first.width * first.height, i => first.labels[i] === 255, o.samples || 800);
  const lambda = grainWeight(sigmaMm / first.dotMm, o.kappa ?? 0.5);
  const score = idx => perceivedDeltaE(idx, idx.labels, sigmaMm, idx.dotGainPct);
  const candidates = [{ label: "nearest stock ink to each flat ink", order: near, deltaE: score(first), idx: first }];
  let evaluations = 0;
  if (samples.length) {
    const s = searchStock(samples, stockHex.map(h => rgbOf(h).map(lin)), rgbOf(base.garment).map(lin), k, near, { lambda });
    evaluations = s.evaluations;
    for (const [label, r] of [["searched from the nearest inks", s.fromNearest], ["searched by adding inks one at a time", s.greedy]]) {
      const order = assignToScreens(flatHex, stockHex, r.set);
      if (candidates.some(c => c.order.join() === order.join())) continue;
      const idx = indexSeparate(image, base, { ...ixo, inks: order.map(j => stockHex[j]) });
      candidates.push({ label, order, deltaE: score(idx), idx });
    }
  }
  let best = candidates[0];
  for (const c of candidates) if (c.deltaE < best.deltaE - 0.005) best = c;
  const out = c => ({ label: c.label, inks: c.order.map(j => stockHex[j]), names: c.order.map(j => list[j].name), deltaE: c.deltaE });
  return {
    inks: best.order.map(j => stockHex[j]), names: best.order.map(j => list[j].name), metres,
    candidates: candidates.map(out), nearestDeltaE: candidates[0].deltaE, gain: +(candidates[0].deltaE - best.deltaE).toFixed(2),
    idx: best.idx, evaluations,
  };
}

/** Lines for the printer: which stock ink goes on which screen, replacing which flat colour. */
export function stockBrief(pick, base) {
  const lines = [`Inks from your stock, chosen for the dots seen from ${pick.metres} m (no custom mixing):`];
  pick.inks.forEach((h, p) => lines.push(`  Screen ${p + 1}: ${pick.names[p]} (${h}), in place of flat colour ${base.inks[p].hex}`));
  lines.push(`Closeness to the painting (mean delta E after a rough eye blur, lower is closer): ${pick.candidates.map(c => `${c.label} ${c.deltaE}`).join("; ")}.`);
  return lines.join("\n");
}
