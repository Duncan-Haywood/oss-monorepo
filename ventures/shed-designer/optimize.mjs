// @ts-check
// Which boards to buy and how to cut them: a one-dimensional cutting-stock
// heuristic over several stock lengths with their own prices.
//
// For each stock length as the "default" board, pieces are placed longest
// first into the open board they fit most tightly (best fit decreasing), or
// into a new default board, or a longer one when the piece needs it. Each
// board is then shrunk to the cheapest stock length that still holds its cuts.
// The cheapest of those plans is kept.
//
// The linear relaxation is then solved by column generation (Gilmore and
// Gomory): a small simplex over cutting patterns, with each new pattern found
// by an exact knapsack search over each stock length. Its whole patterns are
// taken as they are, the leftover pieces go through the same packing, and that
// plan replaces the first one when it is cheaper. The relaxation's optimum is
// a lower bound no order can beat, so the result carries it and the gap to it.

/** @typedef {{ len: number, mark?: string, id?: string, kind?: string }} Piece */
/** @typedef {{ length: number, price: number }} Stock */
/** @typedef {{ stock: number, price: number, cuts: Piece[], used: number, offcut: number }} Board */

/**
 * Length a board must have for these cuts: the pieces plus one kerf between
 * neighbours. The last cut leaves the offcut, so n pieces cost n-1 kerfs when
 * they fill the board exactly and n otherwise; n-1 is used and the offcut
 * absorbs the rest.
 * @param {Piece[]} cuts @param {number} kerf
 */
export function usedLength(cuts, kerf) {
  if (!cuts.length) return 0;
  return cuts.reduce((s, c) => s + c.len, 0) + kerf * (cuts.length - 1);
}

/** @param {Board[]} boards */
const costOf = (boards) => boards.reduce((t, b) => t + b.price, 0);

/** Cheaper, then less wood bought, then fewer boards. @param {Board[]} a @param {Board[]} b @param {number} bCost */
function better(a, b, bCost) {
  const cost = costOf(a);
  if (cost < bCost - 1e-9) return true;
  if (cost > bCost + 1e-9) return false;
  const la = a.reduce((t, x) => t + x.stock, 0);
  const lb = b.reduce((t, x) => t + x.stock, 0);
  return la < lb || (la === lb && a.length < b.length);
}

/**
 * The most a pattern can be worth: a bounded knapsack over the piece lengths,
 * at value y per piece and at most `dem` of each, in a board of `room` inches
 * (each piece takes its length plus a kerf, and the board gets one kerf back).
 * Depth-first branch and bound, densest pieces first.
 * @param {number[]} w @param {number[]} y @param {number[]} dem @param {number} room
 */
function bestPattern(w, y, dem, room) {
  const items = w.map((_, i) => i).filter((i) => y[i] > 1e-12).sort((p, q) => y[q] / w[q] - y[p] / w[p]);
  const cnt = w.map(() => 0);
  let bestV = 0;
  let bestA = cnt.slice();
  const dfs = (j, left, val) => {
    if (val > bestV + 1e-12) { bestV = val; bestA = cnt.slice(); }
    let ub = val;
    let r = left;
    for (let t = j; t < items.length && r > 1e-9; t++) { const i = items[t]; const k = Math.min(dem[i], r / w[i]); ub += k * y[i]; r -= k * w[i]; }
    if (ub <= bestV + 1e-12) return;
    const i = items[j];
    for (let k = Math.min(dem[i], Math.floor((left + 1e-9) / w[i])); k >= 0; k--) {
      cnt[i] = k;
      dfs(j + 1, left - k * w[i], val + k * y[i]);
    }
    cnt[i] = 0;
  };
  if (items.length) dfs(0, room, 0);
  return { value: bestV, a: bestA };
}

/**
 * The linear relaxation of the cutting-stock problem by column generation: a
 * revised simplex over patterns (at most `dem` of each length, any stock), with
 * new patterns priced by `bestPattern`. The bound comes from the final duals y,
 * scaled down by how far any pattern still prices out, so it is a valid lower
 * bound even if the iteration limit stops it early.
 * @param {number[]} lens distinct lengths @param {number[]} dem pieces of each
 * @param {Stock[]} stocks @param {number} kerf
 * @returns {{ bound: number, patterns: { a: number[], x: number }[], optimal: boolean } | null}
 */
export function patternLP(lens, dem, stocks, kerf, maxRounds = 400) {
  const m = lens.length;
  const w = lens.map((l) => l + kerf);
  const rooms = stocks.map((s) => s.length + kerf);
  /** @type {{ a: number[], c: number }[]} */
  const cols = [];
  // Start from one length per board, cut from whichever stock is cheapest per piece.
  for (let i = 0; i < m; i++) {
    let pick = null;
    for (let s = 0; s < stocks.length; s++) {
      const k = Math.min(dem[i], Math.floor((rooms[s] + 1e-9) / w[i]));
      if (k >= 1 && (!pick || stocks[s].price / k < pick.per)) pick = { per: stocks[s].price / k, k, c: stocks[s].price };
    }
    if (!pick) return null;
    const a = lens.map(() => 0);
    a[i] = pick.k;
    cols.push({ a, c: pick.c });
  }
  const basis = cols.map((_, i) => i);
  const Binv = lens.map((_, i) => lens.map((__, j) => (i === j ? 1 / cols[i].a[i] : 0)));
  const xB = dem.map((d, i) => d / cols[i].a[i]);
  const duals = () => {
    const y = lens.map(() => 0);
    basis.forEach((j, r) => { const c = cols[j].c; if (c) for (let i = 0; i < m; i++) y[i] += c * Binv[r][i]; });
    return y;
  };
  /** @param {number[]} a */
  const enter = (a, c) => {
    const d = Binv.map((row) => row.reduce((t, v, i) => t + v * a[i], 0));
    let leave = -1;
    let ratio = Infinity;
    for (let r = 0; r < m; r++) if (d[r] > 1e-9 && xB[r] / d[r] < ratio - 1e-12) { ratio = xB[r] / d[r]; leave = r; }
    if (leave < 0) return false;
    const p = d[leave];
    for (let i = 0; i < m; i++) Binv[leave][i] /= p;
    xB[leave] /= p;
    for (let r = 0; r < m; r++) {
      if (r === leave || !d[r]) continue;
      for (let i = 0; i < m; i++) Binv[r][i] -= d[r] * Binv[leave][i];
      xB[r] -= d[r] * xB[leave];
    }
    cols.push({ a, c });
    basis[leave] = cols.length - 1;
    return true;
  };
  let optimal = false;
  for (let round = 0; round < maxRounds; round++) {
    const y = duals();
    const neg = y.findIndex((v) => v < -1e-9);
    if (neg >= 0) { // a surplus column prices out: over-cutting this length is free
      const a = lens.map(() => 0);
      a[neg] = -1;
      if (!enter(a, 0)) break;
      continue;
    }
    let pick = null;
    for (let s = 0; s < stocks.length; s++) {
      const p = bestPattern(w, y, dem, rooms[s]);
      const gain = p.value - stocks[s].price;
      if (gain > 1e-7 && (!pick || gain > pick.gain)) pick = { gain, a: p.a, c: stocks[s].price };
    }
    if (!pick) { optimal = true; break; }
    if (!enter(pick.a, pick.c)) break;
  }
  const y = duals().map((v) => Math.max(0, v));
  let scale = 1;
  for (let s = 0; s < stocks.length; s++) {
    const v = bestPattern(w, y, dem, rooms[s]).value;
    if (stocks[s].price > 0) scale = Math.max(scale, v / stocks[s].price);
    else if (v > 1e-9) return null;
  }
  const bound = y.reduce((t, v, i) => t + v * dem[i], 0) / scale;
  const patterns = basis.map((j, r) => ({ a: cols[j].a, x: xB[r] })).filter((p) => p.x > 1e-9 && p.a.every((k) => k >= 0));
  return { bound, patterns, optimal };
}

// Design searches re-price the same cut lists many times, so recent relaxations are kept.
const lpCache = new Map();
/** @param {number[]} lens @param {number[]} dem @param {Stock[]} stocks @param {number} kerf */
function cachedLP(lens, dem, stocks, kerf) {
  const key = `${kerf}|${stocks.map((s) => `${s.length}:${s.price}`).join(',')}|${lens.map((l, i) => `${l}x${dem[i]}`).join(',')}`;
  if (lpCache.has(key)) {
    const hit = lpCache.get(key);
    lpCache.delete(key);
    lpCache.set(key, hit);
    return hit;
  }
  const lp = patternLP(lens, dem, stocks, kerf);
  lpCache.set(key, lp);
  if (lpCache.size > 500) lpCache.delete(lpCache.keys().next().value);
  return lp;
}

/**
 * @param {Piece[]} pieces
 * @param {Stock[]} stocks lengths in inches, prices per board
 * @param {number} [kerf]
 */
export function optimizeCuts(pieces, stocks, kerf = 0.125) {
  const sorted = [...stocks].filter((s) => s.length > 0).sort((a, b) => a.length - b.length);
  if (!sorted.length) throw new Error('No stock lengths to cut from');
  const maxLen = sorted[sorted.length - 1].length;
  const fits = pieces.filter((p) => p.len <= maxLen + 1e-9);
  const tooLong = pieces.filter((p) => p.len > maxLen + 1e-9);
  const desc = [...fits].sort((a, b) => b.len - a.len || String(a.mark).localeCompare(String(b.mark)));

  /** Cheapest stock that holds `need` inches. */
  const cheapestFor = (need) => {
    let best = null;
    for (const s of sorted) if (s.length + 1e-9 >= need && (!best || s.price < best.price - 1e-9 || (Math.abs(s.price - best.price) < 1e-9 && s.length < best.length))) best = s;
    return best;
  };

  /** Boards for these cuts, each the cheapest stock that holds them. @param {Piece[][]} groups */
  const toBoards = (groups) => groups.map((cuts) => {
    const used = usedLength(cuts, kerf);
    const s = /** @type {Stock} */ (cheapestFor(used));
    return { stock: s.length, price: s.price, cuts, used, offcut: Math.max(0, s.length - used - (cuts.length && s.length - used > 1e-9 ? kerf : 0)) };
  });

  /** @param {number} B @param {Piece[]} [list] longest first */
  const plan = (B, list = desc) => {
    /** @type {{ cap: number, cuts: Piece[] }[]} */
    const bins = [];
    for (const p of list) {
      let bestBin = null;
      let bestLeft = Infinity;
      for (const b of bins) {
        const left = b.cap - usedLength([...b.cuts, p], kerf);
        if (left >= -1e-9 && left < bestLeft) { bestLeft = left; bestBin = b; }
      }
      if (bestBin) bestBin.cuts.push(p);
      else {
        const cap = p.len <= B + 1e-9 ? B : /** @type {Stock} */ (sorted.find((s) => s.length + 1e-9 >= p.len)).length;
        bins.push({ cap, cuts: [p] });
      }
    }
    return toBoards(bins.map((b) => b.cuts));
  };
  /** Best-fit-decreasing tried with each stock length as the default board. @param {Piece[]} list */
  const pack = (list) => {
    let best = /** @type {Board[]} */ ([]);
    let bestCost = Infinity;
    for (const s of sorted) {
      const boards = plan(s.length, list);
      if (better(boards, best, bestCost)) { best = boards; bestCost = costOf(boards); }
    }
    return best;
  };

  let boards = pack(desc);

  let lowerBound = 0;
  for (const p of fits) {
    let rate = Infinity;
    for (const s of sorted) if (s.length + 1e-9 >= p.len) rate = Math.min(rate, s.price / s.length);
    lowerBound += p.len * rate;
  }

  // The linear relaxation: a proven lower bound, and whole patterns to round from.
  const lens = [...new Set(fits.map((p) => p.len))].sort((a, b) => b - a);
  const lp = lens.length ? cachedLP(lens, lens.map((l) => fits.filter((p) => p.len === l).length), sorted, kerf) : null;
  if (lp) {
    lowerBound = Math.max(lowerBound, lp.bound);
    /** @type {Map<number, Piece[]>} */
    const pool = new Map(lens.map((l) => [l, desc.filter((p) => p.len === l)]));
    /** @type {Piece[][]} */
    const groups = [];
    lp.patterns.forEach(({ a, x }) => {
      for (let n = 0; n < Math.floor(x + 1e-9); n++) {
        if (a.some((k, i) => /** @type {Piece[]} */ (pool.get(lens[i])).length < k)) break;
        groups.push(a.flatMap((k, i) => /** @type {Piece[]} */ (pool.get(lens[i])).splice(0, k)));
      }
    });
    const rest = desc.filter((p) => /** @type {Piece[]} */ (pool.get(p.len)).includes(p));
    const rounded = [...toBoards(groups), ...(rest.length ? pack(rest) : [])];
    if (better(rounded, boards, costOf(boards))) boards = rounded;
  }
  boards.sort((a, b) => b.stock - a.stock || b.used - a.used);
  const cost = costOf(boards);
  const bought = boards.reduce((t, b) => t + b.stock, 0);
  const cut = fits.reduce((t, p) => t + p.len, 0);
  return {
    boards,
    cost: Math.round(cost * 100) / 100,
    lowerBound: Math.round(lowerBound * 100) / 100,
    gap: lowerBound > 0 ? Math.max(0, cost / lowerBound - 1) : 0,
    waste: bought > 0 ? 1 - cut / bought : 0,
    tooLong,
  };
}
