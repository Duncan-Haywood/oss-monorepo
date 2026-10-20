// Tile layout optimizer: where to start the grid, how to bond the rows and how to
// reuse offcuts so a room needs the fewest tiles, with an independent checker.
//
// Everything is integer arithmetic in hundredths of a millimetre ("units", u) so
// that a plan can be verified exactly. Nothing here touches the DOM or the network.
//
// The model, in one paragraph. The floor is a rectangle (inset by an expansion gap
// at the walls) minus rectangular cut-outs (tub, island, cabinet, the corner of an
// L-shaped room). A layout is a tile grid: tile turned or not, rows running along
// the room's x axis, an offset (x0, y0) for the grid and a bond (straight, 1/2 or
// 1/3 stagger). Every tile cell that touches the floor yields a piece: a whole tile,
// a cut rectangle, or (when a cut-out takes a bite) an awkward piece that uses a
// whole tile. The cut rectangles are then packed into tiles by a guillotine packer
// (straight saw cuts only, kerf allowed for), which is the offcut reuse. The
// optimizer searches grid offsets, orientation and bond and keeps the layout that
// buys the fewest tiles without leaving a sliver narrower than the user's minimum.

export const SYSTEMS = {
  metric: { id: "metric", name: "Metric", len: "cm", small: "mm", area: "m²", mm: 10, smallMm: 1, areaMm2: 1e6, sample: "metric" },
  imperial: { id: "imperial", name: "Imperial", len: "in", small: "in", area: "ft²", mm: 25.4, smallMm: 25.4, areaMm2: 92903.04, sample: "imperial" },
};

const U = 100; // units per millimetre

export const BONDS = [
  { id: "straight", name: "Straight (stacked) grid", num: 0, den: 1 },
  { id: "half", name: "Brick, half offset", num: 1, den: 2 },
  { id: "third", name: "Brick, one-third offset", num: 1, den: 3 },
];

export const DEFAULTS = {
  grout: 3, // mm or in via small unit; set per system below
  gap: 10,
  kerf: 2,
  minCutMm: 50, // narrowest acceptable cut piece
  spare: 5,
  ruleWaste: 10,
  steps: 16,
  restarts: 30,
};

export const toU = (value, mmPer) => Math.round(value * mmPer * U);
export const fromU = (u, mmPer) => u / U / mmPer;

// ---------- formatting ----------
export function fmtNum(x, d = 1) {
  if (!Number.isFinite(x)) return "–";
  return (+x.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}
export const fmtInt = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "–");
export const pct = (x, d = 0) => (Number.isFinite(x) ? `${fmtNum(x * 100, d)}%` : "–");
export function lenText(u, sys) {
  return `${fmtNum(fromU(u, sys.mm), sys.id === "metric" ? 1 : 2)} ${sys.len}`;
}
export function areaText(u2, sys) {
  return `${fmtNum(u2 / (U * U) / sys.areaMm2, 2)} ${sys.area}`;
}
export function money(x) {
  return Number.isFinite(x) ? x.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "–";
}

// ---------- rectangles ----------
const rect = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
const rw = (r) => r.x1 - r.x0;
const rh = (r) => r.y1 - r.y0;
const rarea = (r) => rw(r) * rh(r);

function intersect(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  return x0 < x1 && y0 < y1 ? rect(x0, y0, x1, y1) : null;
}

// r minus c, as disjoint rectangles (0 to 4 of them).
function subtract(r, c) {
  const i = intersect(r, c);
  if (!i) return [r];
  const out = [];
  if (r.y0 < i.y0) out.push(rect(r.x0, r.y0, r.x1, i.y0));
  if (i.y1 < r.y1) out.push(rect(r.x0, i.y1, r.x1, r.y1));
  if (r.x0 < i.x0) out.push(rect(r.x0, i.y0, i.x0, i.y1));
  if (i.x1 < r.x1) out.push(rect(i.x1, i.y0, r.x1, i.y1));
  return out;
}

const mod = (a, n) => ((a % n) + n) % n;

// ---------- problem ----------

/**
 * raw: { roomW, roomL, cutouts:[{x,y,w,h}], grout, gap, kerf, minCut, spare, ruleWaste,
 *        bonds:[ids], rotation:"either"|"fixed", offcutRotate:bool, reuse:bool,
 *        tiles:[{name,w,h,perBox,boxPrice}] }   (lengths in sys.len, small ones in sys.small)
 * Returns { problem, errors }.
 */
export function buildProblem(raw, sys) {
  const errors = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  const room = { w: toU(raw.roomW, sys.mm), l: toU(raw.roomL, sys.mm) };
  if (!pos(raw.roomW) || !pos(raw.roomL)) errors.push("Enter the room width and length as positive numbers.");
  const grout = toU(raw.grout ?? 0, sys.smallMm);
  const gap = toU(raw.gap ?? 0, sys.smallMm);
  const kerf = toU(raw.kerf ?? 0, sys.smallMm);
  const minCut = toU(raw.minCut ?? 0, sys.smallMm);
  for (const [k, v] of [["grout joint", raw.grout], ["wall gap", raw.gap], ["saw kerf", raw.kerf], ["narrowest cut", raw.minCut]]) {
    if (!nonneg(v ?? 0)) errors.push(`The ${k} must be zero or more.`);
  }
  const R = rect(gap, gap, room.w - gap, room.l - gap);
  if (R.x0 >= R.x1 || R.y0 >= R.y1) errors.push("The wall gap leaves no floor.");

  const cutouts = [];
  for (const [i, c] of (raw.cutouts || []).entries()) {
    const vals = [c.x, c.y, c.w, c.h];
    if (vals.every((v) => v === "" || v == null || Number.isNaN(v))) continue;
    if (!vals.every(Number.isFinite) || c.w <= 0 || c.h <= 0 || c.x < 0 || c.y < 0) {
      errors.push(`Cut-out ${i + 1}: enter from-left, from-back, width and depth (width and depth above zero).`);
      continue;
    }
    const r = intersect(rect(toU(c.x, sys.mm), toU(c.y, sys.mm), toU(c.x + c.w, sys.mm), toU(c.y + c.h, sys.mm)), rect(0, 0, room.w, room.l));
    if (r) cutouts.push(r);
  }

  const tiles = [];
  for (const [i, t] of (raw.tiles || []).entries()) {
    if ([t.w, t.h].every((v) => v === "" || v == null || Number.isNaN(v))) continue;
    if (!pos(t.w) || !pos(t.h)) { errors.push(`Tile option ${i + 1}: enter a positive width and length.`); continue; }
    const w = toU(t.w, sys.mm), h = toU(t.h, sys.mm);
    if (w <= grout || h <= grout) { errors.push(`Tile option ${i + 1}: the tile must be larger than the grout joint.`); continue; }
    const perBox = Number.isFinite(t.perBox) && t.perBox >= 1 ? Math.floor(t.perBox) : null;
    const boxPrice = Number.isFinite(t.boxPrice) && t.boxPrice >= 0 ? t.boxPrice : null;
    tiles.push({ id: i, name: String(t.name || `Tile ${i + 1}`).slice(0, 60), w, h, perBox, boxPrice });
  }
  if (!tiles.length) errors.push("Add at least one tile option with a size.");
  const bonds = BONDS.filter((b) => (raw.bonds || ["straight", "half", "third"]).includes(b.id));
  if (!bonds.length) errors.push("Pick at least one bond pattern.");

  const problem = {
    room, R, cutouts, grout, gap, kerf, minCut, tiles, bonds,
    rotation: raw.rotation === "fixed" ? "fixed" : "either",
    offcutRotate: Boolean(raw.offcutRotate),
    reuse: raw.reuse !== false,
    spare: Number.isFinite(raw.spare) && raw.spare >= 0 ? raw.spare : DEFAULTS.spare,
    ruleWaste: Number.isFinite(raw.ruleWaste) && raw.ruleWaste >= 0 ? raw.ruleWaste : DEFAULTS.ruleWaste,
    steps: raw.steps || DEFAULTS.steps,
    restarts: raw.restarts ?? DEFAULTS.restarts,
  };
  if (!errors.length) {
    for (const t of tiles) {
      const cells = (rw(R) / (Math.min(t.w, t.h) + grout) + 2) * (rh(R) / (Math.min(t.w, t.h) + grout) + 2);
      if (cells > 40000) errors.push(`${t.name}: that would be about ${fmtInt(cells)} tiles. Check the units (the room is in ${sys.len}).`);
    }
  }
  problem.floor = floorArea(problem);
  return { problem, errors };
}

function floorArea(p) {
  // area of R minus the cut-outs, exactly
  let parts = [p.R];
  for (const c of p.cutouts) parts = parts.flatMap((r) => subtract(r, c));
  return parts.reduce((s, r) => s + rarea(r), 0);
}

// ---------- layouts ----------

function shiftOf(j, px, bond) {
  if (bond.num === 0) return 0;
  return Math.floor((px * mod(j * bond.num, bond.den)) / bond.den);
}

function cellsFor(p, tile, layout) {
  const rot = layout.rot === 1;
  const tw = rot ? tile.h : tile.w, th = rot ? tile.w : tile.h;
  const px = tw + p.grout, py = th + p.grout;
  const bond = layout.bond;
  const out = [];
  const { R } = p;
  const jMin = Math.floor((R.y0 - layout.y0) / py) - 1;
  const jMax = Math.ceil((R.y1 - layout.y0) / py) + 1;
  for (let j = jMin; j <= jMax; j++) {
    const y0 = layout.y0 + j * py;
    if (y0 + th <= R.y0 || y0 >= R.y1) continue;
    const s = shiftOf(j, px, bond);
    const iMin = Math.floor((R.x0 - layout.x0 - s) / px) - 1;
    const iMax = Math.ceil((R.x1 - layout.x0 - s) / px) + 1;
    for (let i = iMin; i <= iMax; i++) {
      const x0 = layout.x0 + s + i * px;
      if (x0 + tw <= R.x0 || x0 >= R.x1) continue;
      out.push(rect(x0, y0, x0 + tw, y0 + th));
    }
  }
  return { cells: out, tw, th, px, py, rot };
}

function piecesFor(p, tile, layout) {
  const { cells, tw, th, rot } = cellsFor(p, tile, layout);
  const pieces = [];
  for (const cell of cells) {
    const clipped = intersect(cell, p.R);
    if (!clipped) continue;
    let rects = [clipped];
    for (const c of p.cutouts) {
      rects = rects.flatMap((r) => subtract(r, c));
      if (!rects.length) break;
    }
    if (!rects.length) continue;
    let kind = "complex", a = 0, b = 0;
    if (rects.length === 1) {
      const r = rects[0];
      if (rw(r) === tw && rh(r) === th) kind = "full";
      else {
        kind = "cut";
        a = rot ? rh(r) : rw(r);
        b = rot ? rw(r) : rh(r);
      }
    }
    pieces.push({ id: pieces.length, cell, rects, kind, a, b, area: rects.reduce((s, r) => s + rarea(r), 0) });
  }
  return { pieces, tw, th, rot };
}

// ---------- guillotine packing of cut pieces into tiles ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function packOnce(cuts, W, H, kerf, rotateOK) {
  const bins = [];
  for (const piece of cuts) {
    let best = null;
    for (let bi = 0; bi < bins.length; bi++) {
      const free = bins[bi].free;
      for (let fi = 0; fi < free.length; fi++) {
        const f = free[fi];
        for (const rotated of rotateOK ? [false, true] : [false]) {
          const pa = rotated ? piece.b : piece.a, pb = rotated ? piece.a : piece.b;
          if (pa <= f.w && pb <= f.h) {
            const score = Math.min(f.w - pa, f.h - pb) * 1e6 + Math.max(f.w - pa, f.h - pb) / 1e3 + bi * 1e-6;
            if (!best || score < best.score) best = { bi, fi, rotated, score, pa, pb };
          }
        }
      }
    }
    if (!best) {
      bins.push({ free: [{ x: 0, y: 0, w: W, h: H }], placed: [] });
      const bi = bins.length - 1;
      const rotated = rotateOK && piece.a > W; // only rotate into an empty tile if it does not fit upright
      const pa = rotated ? piece.b : piece.a, pb = rotated ? piece.a : piece.b;
      best = { bi, fi: 0, rotated, pa, pb };
    }
    const bin = bins[best.bi];
    const f = bin.free[best.fi];
    bin.placed.push({ pid: piece.id, x: f.x, y: f.y, w: best.pa, h: best.pb, rotated: best.rotated });
    bin.free.splice(best.fi, 1);
    const right = f.w - best.pa, top = f.h - best.pb;
    // shorter-axis split keeps the larger leftover whole
    if (right < top) {
      if (right - kerf > 0) bin.free.push({ x: f.x + best.pa + kerf, y: f.y, w: right - kerf, h: best.pb });
      if (top - kerf > 0) bin.free.push({ x: f.x, y: f.y + best.pb + kerf, w: f.w, h: top - kerf });
    } else {
      if (right - kerf > 0) bin.free.push({ x: f.x + best.pa + kerf, y: f.y, w: right - kerf, h: f.h });
      if (top - kerf > 0) bin.free.push({ x: f.x, y: f.y + best.pb + kerf, w: best.pa, h: top - kerf });
    }
  }
  return bins;
}

const ORDERS = [
  (a, b) => b.a * b.b - a.a * a.b,
  (a, b) => Math.max(b.a, b.b) - Math.max(a.a, a.b) || b.a * b.b - a.a * a.b,
  (a, b) => b.a - a.a || b.b - a.b,
  (a, b) => b.b - a.b || b.a - a.a,
];

function packCuts(cuts, W, H, kerf, rotateOK, restarts, seed) {
  if (!cuts.length) return [];
  let best = null;
  const take = (bins) => {
    if (!best || bins.length < best.length) best = bins;
  };
  for (const cmp of ORDERS) take(packOnce([...cuts].sort(cmp), W, H, kerf, rotateOK));
  const rnd = mulberry32(seed);
  for (let r = 0; r < restarts && cuts.length > 1; r++) {
    const arr = [...cuts];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // half the restarts perturb the best-first order instead of shuffling fully
    if (r % 2 === 0) arr.sort((a, b) => b.a * b.b * (0.8 + 0.4 * rnd()) - a.a * a.b * (0.8 + 0.4 * rnd()));
    take(packOnce(arr, W, H, kerf, rotateOK));
  }
  return best;
}

// ---------- evaluating one layout ----------

function lowerBoundTiles(full, complex, cutAreaSum, tileArea) {
  return full + complex + Math.ceil(cutAreaSum / tileArea);
}

function evaluate(p, tile, layout, restarts, seed) {
  const { pieces, tw, th, rot } = piecesFor(p, tile, layout);
  const W = tile.w, H = tile.h; // tile frame
  let full = 0, complex = 0, slivers = 0, narrowest = Infinity, usedArea = 0, cutAreaSum = 0;
  const cuts = [];
  for (const pc of pieces) {
    usedArea += pc.area;
    if (pc.kind === "full") full++;
    else if (pc.kind === "complex") complex++;
    else { cuts.push(pc); cutAreaSum += pc.area; }
    if (pc.kind !== "full") {
      for (const r of pc.rects) {
        for (const [d, whole] of [[rw(r), tw], [rh(r), th]]) {
          if (d < whole) {
            if (d < narrowest) narrowest = d;
            if (d < p.minCut) slivers++;
          }
        }
      }
    }
  }
  let bins;
  if (p.reuse) bins = packCuts(cuts, W, H, p.kerf, p.offcutRotate, restarts, seed);
  else bins = cuts.map((c) => ({ free: [], placed: [{ pid: c.id, x: 0, y: 0, w: c.a, h: c.b, rotated: false }] }));
  const tiles = full + complex + bins.length;
  return {
    layout, pieces, bins, full, complex, tiles, cutCount: cuts.length + complex, slivers,
    narrowest: Number.isFinite(narrowest) ? narrowest : null,
    usedArea, tileArea: W * H, tw, th, rot,
    lowerBound: lowerBoundTiles(full, complex, cutAreaSum, W * H),
  };
}

const better = (a, b) => {
  if (!b) return true;
  if ((a.slivers > 0) !== (b.slivers > 0)) return a.slivers === 0;
  if (a.slivers > 0 && a.slivers !== b.slivers) return a.slivers < b.slivers;
  if (a.tiles !== b.tiles) return a.tiles < b.tiles;
  if (a.cutCount !== b.cutCount) return a.cutCount < b.cutCount;
  return (a.narrowest ?? Infinity) > (b.narrowest ?? Infinity);
};

function axisCandidates(p, lo, extent, pitch, tileLen, steps) {
  const set = new Set();
  for (let k = 0; k < steps; k++) set.add(Math.floor((pitch * k) / steps));
  // symmetric starts: a tile centred on the room, and a joint centred on the room
  const centre = Math.floor((lo + extent) / 2);
  set.add(mod(centre - Math.floor(tileLen / 2), pitch));
  set.add(mod(centre + Math.floor(p.grout / 2), pitch));
  // the grid starting exactly at the wall
  set.add(mod(lo, pitch));
  return [...set];
}

function describe(p, plan) {
  const { layout, tw, th } = plan;
  const px = tw + p.grout, py = th + p.grout;
  const dx = mod(layout.x0 - p.R.x0, px);
  const dy = mod(layout.y0 - p.R.y0, py);
  plan.start = { fromLeft: dx, fromBack: dy, wallCutLeft: dx === 0 ? 0 : Math.max(0, dx - p.grout), wallCutBack: dy === 0 ? 0 : Math.max(0, dy - p.grout) };
  return plan;
}

/**
 * Search layouts for one tile option. Returns the best plan and a short list of
 * distinct alternatives (best layout per orientation and bond).
 */
export function optimizeTile(p, tile, opts = {}) {
  const steps = opts.steps ?? p.steps;
  const restarts = opts.restarts ?? p.restarts;
  const rots = p.rotation === "fixed" || tile.w === tile.h ? [0] : [0, 1];
  const candidates = [];
  for (const rot of rots) {
    const tw = rot ? tile.h : tile.w, th = rot ? tile.w : tile.h;
    const px = tw + p.grout, py = th + p.grout;
    const xs = axisCandidates(p, p.R.x0, rw(p.R), px, tw, steps);
    const ys = axisCandidates(p, p.R.y0, rh(p.R), py, th, steps);
    for (const bond of p.bonds) {
      for (const x0 of xs) for (const y0 of ys) candidates.push({ rot, bond, x0, y0 });
    }
  }
  const quick = candidates.map((layout) => evaluate(p, tile, layout, 0, 1));
  let ranked = quick.slice().sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  // local refinement around the leaders
  const refined = [];
  for (const lead of ranked.slice(0, 4)) {
    const { layout } = lead;
    const px = lead.tw + p.grout, py = lead.th + p.grout;
    for (const d of [Math.floor(px / (steps * 4)), Math.floor(px / (steps * 2))]) {
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const l2 = { ...layout, x0: mod(layout.x0 + sx * d, px), y0: mod(layout.y0 + sy * Math.floor((d * py) / px), py) };
        refined.push(evaluate(p, tile, l2, 0, 1));
      }
    }
  }
  ranked = ranked.concat(refined).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  // multi-start packing on the best distinct layouts
  const finalists = [];
  const seen = new Set();
  for (const r of ranked) {
    const key = `${r.layout.rot}|${r.layout.bond.id}|${r.layout.x0}|${r.layout.y0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    finalists.push(r);
    if (finalists.length >= 8) break;
  }
  const done = finalists.map((f, i) => evaluate(p, tile, f.layout, restarts, 7 + i));
  done.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const best = describe(p, done[0]);
  // alternatives: best of each (rot, bond)
  const alts = [];
  const seenAlt = new Set();
  for (const r of ranked) {
    const key = `${r.layout.rot}|${r.layout.bond.id}`;
    if (seenAlt.has(key)) continue;
    seenAlt.add(key);
    alts.push(r);
  }
  const alternatives = alts.slice(0, 6).map((a) => describe(p, evaluate(p, tile, a.layout, Math.floor(restarts / 2), 11)));
  alternatives.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  return { tile, best, alternatives, searched: candidates.length };
}

// ---------- purchase maths and baselines ----------

export function purchase(p, tile, tilesNeeded) {
  const withSpare = Math.ceil(tilesNeeded * (1 + p.spare / 100));
  let boxes = null, bought = withSpare, cost = null;
  if (tile.perBox) {
    boxes = Math.ceil(withSpare / tile.perBox);
    bought = boxes * tile.perBox;
    if (tile.boxPrice != null) cost = boxes * tile.boxPrice;
  }
  return { tilesNeeded, withSpare, boxes, bought, cost };
}

/** The rule of thumb: floor area over tile area plus a waste percentage. */
export function ruleOfThumb(p, tile) {
  const tilesRaw = p.floor / ((tile.w + p.grout) * (tile.h + p.grout));
  const needed = Math.ceil(tilesRaw * (1 + p.ruleWaste / 100));
  return purchase({ ...p, spare: 0 }, tile, needed);
}

/** The naive layout: corner start, straight grid, no offcut reuse. */
export function naiveLayout(p, tile) {
  const layout = { rot: 0, bond: BONDS[0], x0: p.R.x0, y0: p.R.y0 };
  const plan = evaluate({ ...p, reuse: false }, tile, layout, 0, 1);
  return describe(p, plan);
}

export function planAll(p, opts = {}) {
  const results = p.tiles.map((tile) => {
    const opt = optimizeTile(p, tile, opts);
    const buy = purchase(p, tile, opt.best.tiles);
    const thumb = ruleOfThumb(p, tile);
    const naive = naiveLayout(p, tile);
    const naiveBuy = purchase(p, tile, naive.tiles);
    return { ...opt, buy, thumb, naive, naiveBuy };
  });
  const order = results.map((r, i) => i).sort((a, b) => {
    const ra = results[a], rb = results[b];
    if ((ra.best.slivers > 0) !== (rb.best.slivers > 0)) return ra.best.slivers > 0 ? 1 : -1;
    const ca = ra.buy.cost, cb = rb.buy.cost;
    if (ca != null && cb != null && ca !== cb) return ca - cb;
    return ra.buy.bought * ra.tile.w * ra.tile.h - rb.buy.bought * rb.tile.w * rb.tile.h;
  });
  return { results, order };
}

// ---------- independent verifier ----------

/**
 * Re-checks a plan from first principles: the grid is the layout's grid, every piece
 * is inside its tile cell and the floor, the pieces cover every part of the floor that
 * is not a grout joint exactly once, every cut rectangle sits inside exactly one
 * purchased tile without overlapping another piece or crossing a saw kerf, and the
 * tile count is the sum of the parts. Returns { ok, errors }.
 */
export function verifyPlan(p, tile, plan) {
  const errors = [];
  const err = (m) => { if (errors.length < 25) errors.push(m); };
  const { layout, pieces, bins } = plan;
  const rot = layout.rot === 1;
  const tw = rot ? tile.h : tile.w, th = rot ? tile.w : tile.h;
  const px = tw + p.grout, py = th + p.grout;
  const bond = layout.bond;

  // 1 and 2: pieces
  for (const pc of pieces) {
    const c = pc.cell;
    if (c.x1 - c.x0 !== tw || c.y1 - c.y0 !== th) err(`piece ${pc.id}: cell is not tile sized`);
    const dj = (c.y0 - layout.y0) / py;
    if (!Number.isInteger(dj)) { err(`piece ${pc.id}: cell row is off the grid`); continue; }
    const s = shiftOf(dj, px, bond);
    if (mod(c.x0 - layout.x0 - s, px) !== 0) err(`piece ${pc.id}: cell column is off the grid`);
    let sum = 0;
    for (const r of pc.rects) {
      if (r.x0 < c.x0 || r.x1 > c.x1 || r.y0 < c.y0 || r.y1 > c.y1) err(`piece ${pc.id}: outside its tile`);
      if (r.x0 < p.R.x0 || r.x1 > p.R.x1 || r.y0 < p.R.y0 || r.y1 > p.R.y1) err(`piece ${pc.id}: outside the floor`);
      for (const cut of p.cutouts) if (intersect(r, cut)) err(`piece ${pc.id}: overlaps a cut-out`);
      sum += rarea(r);
    }
    for (let i = 0; i < pc.rects.length; i++) for (let j = i + 1; j < pc.rects.length; j++) if (intersect(pc.rects[i], pc.rects[j])) err(`piece ${pc.id}: its own rectangles overlap`);
    if (sum !== pc.area) err(`piece ${pc.id}: area mismatch`);
    if (pc.kind === "full" && (pc.rects.length !== 1 || sum !== tw * th)) err(`piece ${pc.id}: marked whole but is not`);
  }

  // 3: coverage sweep over compressed coordinates
  const xsSet = new Set([p.R.x0, p.R.x1]), ysSet = new Set([p.R.y0, p.R.y1]);
  for (const cut of p.cutouts) { xsSet.add(cut.x0); xsSet.add(cut.x1); ysSet.add(cut.y0); ysSet.add(cut.y1); }
  for (const pc of pieces) for (const r of pc.rects) { xsSet.add(r.x0); xsSet.add(r.x1); ysSet.add(r.y0); ysSet.add(r.y1); }
  const jMin = Math.floor((p.R.y0 - layout.y0) / py) - 1, jMax = Math.ceil((p.R.y1 - layout.y0) / py) + 1;
  for (let j = jMin; j <= jMax; j++) {
    const y0 = layout.y0 + j * py;
    ysSet.add(y0); ysSet.add(y0 + th);
    const s = shiftOf(j, px, bond);
    const iMin = Math.floor((p.R.x0 - layout.x0 - s) / px) - 1, iMax = Math.ceil((p.R.x1 - layout.x0 - s) / px) + 1;
    for (let i = iMin; i <= iMax; i++) { const x0 = layout.x0 + s + i * px; xsSet.add(x0); xsSet.add(x0 + tw); }
  }
  const clampX = (v) => v >= p.R.x0 && v <= p.R.x1;
  const xs = [...xsSet].filter(clampX).sort((a, b) => a - b);
  const ys = [...ysSet].filter((v) => v >= p.R.y0 && v <= p.R.y1).sort((a, b) => a - b);
  const xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i]));
  const nx = xs.length - 1, ny = ys.length - 1;
  const cover = new Uint8Array(Math.max(0, nx * ny));
  for (const pc of pieces) {
    for (const r of pc.rects) {
      const a = xi.get(r.x0), b = xi.get(r.x1), c = yi.get(r.y0), d = yi.get(r.y1);
      if (a === undefined || b === undefined || c === undefined || d === undefined) { err(`piece ${pc.id}: not on the floor grid`); continue; }
      for (let y = c; y < d; y++) for (let x = a; x < b; x++) cover[y * nx + x] = Math.min(255, cover[y * nx + x] + 1);
    }
  }
  for (let y = 0; y < ny; y++) {
    const yc2 = ys[y] + ys[y + 1];
    const j = Math.floor((yc2 / 2 - layout.y0) / py);
    const rowTop = layout.y0 + j * py;
    const inRow = yc2 >= 2 * rowTop && yc2 < 2 * (rowTop + th);
    const s = shiftOf(j, px, bond);
    for (let x = 0; x < nx; x++) {
      const xc2 = xs[x] + xs[x + 1];
      const inCut = p.cutouts.some((c) => xc2 > 2 * c.x0 && xc2 < 2 * c.x1 && yc2 > 2 * c.y0 && yc2 < 2 * c.y1);
      const inTile = inRow && mod(xc2 - 2 * (layout.x0 + s), 2 * px) < 2 * tw;
      const want = inTile && !inCut ? 1 : 0;
      if (cover[y * nx + x] !== want) {
        err(`floor cell near (${xs[x]}, ${ys[y]}) is covered ${cover[y * nx + x]} times, expected ${want}`);
        break;
      }
    }
    if (errors.length > 20) break;
  }

  // 4: bins
  const byId = new Map(pieces.map((pc) => [pc.id, pc]));
  const placedOnce = new Map();
  for (const [bi, bin] of bins.entries()) {
    if (!p.reuse && bin.placed.length !== 1) err(`tile ${bi + 1}: offcut reuse is off but it holds ${bin.placed.length} pieces`);
    for (const a of bin.placed) {
      const pc = byId.get(a.pid);
      if (!pc || pc.kind !== "cut") { err(`tile ${bi + 1}: holds a piece that is not a cut rectangle`); continue; }
      placedOnce.set(a.pid, (placedOnce.get(a.pid) || 0) + 1);
      const wantW = a.rotated ? pc.b : pc.a, wantH = a.rotated ? pc.a : pc.b;
      if (a.rotated && !p.offcutRotate) err(`tile ${bi + 1}: a piece is turned although turning offcuts is off`);
      if (a.w !== wantW || a.h !== wantH) err(`tile ${bi + 1}: placed size differs from the piece`);
      if (a.x < 0 || a.y < 0 || a.x + a.w > tile.w || a.y + a.h > tile.h) err(`tile ${bi + 1}: a piece runs past the tile edge`);
    }
    for (let i = 0; i < bin.placed.length; i++) {
      for (let j = i + 1; j < bin.placed.length; j++) {
        const a = bin.placed[i], b = bin.placed[j];
        const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        const gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
        if (gx < p.kerf && gy < p.kerf) err(`tile ${bi + 1}: two pieces overlap or leave less than the saw kerf`);
      }
    }
  }
  for (const pc of pieces) {
    if (pc.kind === "cut" && placedOnce.get(pc.id) !== 1) err(`piece ${pc.id}: assigned to ${placedOnce.get(pc.id) || 0} tiles`);
  }

  // 5: counts
  const full = pieces.filter((x) => x.kind === "full").length;
  const complex = pieces.filter((x) => x.kind === "complex").length;
  if (plan.tiles !== full + complex + bins.length) err("tile count is not whole + awkward + cut tiles");
  if (plan.tiles < plan.lowerBound) err("fewer tiles than the area lower bound");
  const areaTiles = Math.ceil(plan.usedArea / (tile.w * tile.h));
  if (plan.tiles < areaTiles) err("fewer tiles than the area they must cover");

  // 6: slivers recount
  let sl = 0;
  for (const pc of pieces) {
    if (pc.kind === "full") continue;
    for (const r of pc.rects) {
      if (rw(r) < tw && rw(r) < p.minCut) sl++;
      if (rh(r) < th && rh(r) < p.minCut) sl++;
    }
  }
  if (sl !== plan.slivers) err(`sliver count differs (${sl} vs ${plan.slivers})`);
  return { ok: errors.length === 0, errors };
}

// ---------- drawing and exports ----------

/** Rectangles to draw: each carries kind, the tile (bin) its material comes from and a sliver flag. */
export function viewItems(p, plan) {
  const binOf = new Map();
  const place = new Map();
  plan.bins.forEach((b, i) => b.placed.forEach((a) => { binOf.set(a.pid, i); place.set(a.pid, a); }));
  const out = [];
  for (const pc of plan.pieces) {
    for (const r of pc.rects) {
      const sliver = pc.kind !== "full" && ((rw(r) < plan.tw && rw(r) < p.minCut) || (rh(r) < plan.th && rh(r) < p.minCut));
      const shared = pc.kind === "cut" && plan.bins[binOf.get(pc.id)]?.placed.length > 1;
      out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, kind: pc.kind, bin: binOf.get(pc.id) ?? null, sliver, shared });
    }
  }
  return out;
}

/** The cutting list: one line per cut piece, grouped by the tile it is cut from. */
export function cutList(p, plan, sys) {
  const rows = [];
  plan.bins.forEach((bin, i) => {
    bin.placed.forEach((a, k) => {
      const pc = plan.pieces.find((x) => x.id === a.pid);
      const r = pc.rects[0];
      rows.push({
        tile: i + 1, n: k + 1, of: bin.placed.length,
        cut: pc.kind === "cut" ? `${lenText(pc.a, sys)} × ${lenText(pc.b, sys)}` : "irregular",
        fromLeft: r.x0 - p.R.x0, fromBack: r.y0 - p.R.y0, turned: a.rotated,
      });
    });
  });
  return rows;
}

export function reportCsv(p, result, sys) {
  const plan = result.best;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["tile_to_cut", "piece_in_tile", "pieces_from_this_tile", "cut_size_across_by_along_tile", `position_from_left_wall_${sys.len}`, `position_from_back_wall_${sys.len}`, "turned_in_tile"].join(",")];
  const rows = cutList(p, plan, sys);
  const f = (u) => fmtNum(fromU(u, sys.mm), 2);
  for (const r of rows) lines.push([r.tile, r.n, r.of, q(r.cut), f(r.fromLeft), f(r.fromBack), r.turned ? "yes" : "no"].join(","));
  return lines.join("\n") + "\n";
}

export function layoutText(p, plan, sys) {
  const bits = [];
  bits.push(plan.rot ? "tiles turned so their long side runs across the room" : "tiles laid as entered");
  bits.push(plan.layout.bond.name.toLowerCase());
  return `${bits.join(", ")}; first grid line ${lenText(plan.start.fromLeft, sys)} from the left wall and ${lenText(plan.start.fromBack, sys)} from the back wall`;
}

// ---------- example ----------

export function sampleInput(sys) {
  const imp = sys.id === "imperial";
  const f = (cm, inch) => (imp ? inch : cm);
  return {
    roomW: f(367, 144.5),
    roomL: f(512, 201.5),
    cutouts: [
      { x: f(0, 0), y: f(362, 142.5), w: f(170, 67), h: f(150, 59) },
    ],
    grout: imp ? 0.125 : 3,
    gap: imp ? 0.375 : 10,
    kerf: imp ? 0.0625 : 2,
    minCut: imp ? 2 : 50,
    spare: 5,
    ruleWaste: 10,
    bonds: ["straight", "half", "third"],
    rotation: "either",
    offcutRotate: false,
    reuse: true,
    tiles: [
      { name: "Porcelain plank", w: f(20, 8), h: f(120, 48), perBox: 6, boxPrice: 62 },
      { name: "Large format", w: f(60, 24), h: f(60, 24), perBox: 4, boxPrice: 68 },
      { name: "Subway-size", w: f(30, 12), h: f(60, 24), perBox: 8, boxPrice: 71 },
    ],
  };
}

/** Parse a pasted block: "name, width, length, tiles per box, price per box" per line. */
export function parseTiles(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const cells = t.split(/\t|,/).map((s) => s.trim());
    const nums = cells.slice(1).map((s) => (s === "" ? NaN : Number(s.replace(/[$\s]/g, ""))));
    out.push({ name: cells[0], w: nums[0], h: nums[1], perBox: nums[2], boxPrice: nums[3] });
  }
  return out;
}
