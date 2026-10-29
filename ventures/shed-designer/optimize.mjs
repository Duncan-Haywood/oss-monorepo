// @ts-check
// Which boards to buy and how to cut them: a one-dimensional cutting-stock
// heuristic over several stock lengths with their own prices.
//
// For each stock length as the "default" board, pieces are placed longest
// first into the open board they fit most tightly (best fit decreasing), or
// into a new default board, or a longer one when the piece needs it. Each
// board is then shrunk to the cheapest stock length that still holds its cuts.
// The cheapest of those plans wins. It is a heuristic, so the result also
// carries a lower bound (every inch of every piece bought at the cheapest
// price per inch of any board long enough for it) and the gap to it.

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

  /** @param {number} B */
  const plan = (B) => {
    /** @type {{ cap: number, cuts: Piece[] }[]} */
    const bins = [];
    for (const p of desc) {
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
    /** @type {Board[]} */
    const boards = bins.map((b) => {
      const used = usedLength(b.cuts, kerf);
      const s = /** @type {Stock} */ (cheapestFor(used));
      return { stock: s.length, price: s.price, cuts: b.cuts, used, offcut: Math.max(0, s.length - used - (b.cuts.length && s.length - used > 1e-9 ? kerf : 0)) };
    });
    return boards;
  };

  let best = /** @type {Board[] | null} */ (null);
  let bestCost = Infinity;
  for (const s of sorted) {
    const boards = plan(s.length);
    const cost = boards.reduce((t, b) => t + b.price, 0);
    const len = boards.reduce((t, b) => t + b.stock, 0);
    const bestLenSum = best ? best.reduce((t, b) => t + b.stock, 0) : Infinity;
    if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) < 1e-9 && (len < bestLenSum || (len === bestLenSum && boards.length < /** @type {Board[]} */ (best).length)))) {
      best = boards;
      bestCost = cost;
    }
  }
  const boards = /** @type {Board[]} */ (best || []);
  boards.sort((a, b) => b.stock - a.stock || b.used - a.used);

  let lowerBound = 0;
  for (const p of fits) {
    let rate = Infinity;
    for (const s of sorted) if (s.length + 1e-9 >= p.len) rate = Math.min(rate, s.price / s.length);
    lowerBound += p.len * rate;
  }
  const cost = boards.reduce((t, b) => t + b.price, 0);
  const bought = boards.reduce((t, b) => t + b.stock, 0);
  const cut = fits.reduce((t, p) => t + p.len, 0);
  return {
    boards,
    cost: Math.round(cost * 100) / 100,
    lowerBound: Math.round(lowerBound * 100) / 100,
    gap: lowerBound > 0 ? cost / lowerBound - 1 : 0,
    waste: bought > 0 ? 1 - cut / bought : 0,
    tooLong,
  };
}
