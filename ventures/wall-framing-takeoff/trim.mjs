// @ts-check
// Interior trim: baseboard and door and window casing, as cut pieces packed
// into stock lengths, not a lineal-foot guess.
//
// Baseboard runs the wall's length between doors (a door's width is left out;
// a window does not break it). Exterior walls (sheathed) get one face, interior
// walls (`sheathed: false`) two, unless `baseSides` says otherwise. Casing goes
// on the interior face of every opening, and on both faces of an interior
// wall's openings: two legs and a head for a door, two legs, a head and a sill
// piece for a window. The reveal, the casing width and the stock length are
// figures you type from the trim you buy (defaults: 3/16 in reveal, 2.25 in
// casing, 8 ft stock, 12 ft baseboard stock). Corner mitres are not
// modelled. A run longer than the stock is split; `scarf` (inches, default 0,
// a butt joint) adds the overlap each splice uses, the waste figure covers the rest.

/** @typedef {{ baseSides?: 1|2, baseStock?: number, casingStock?: number, casingWidth?: number, reveal?: number, waste?: number, basePrice?: number, casingPrice?: number, base?: boolean, casing?: boolean, shoe?: boolean, shoeStock?: number, shoePrice?: number, scarf?: number }} Trim */

/** @param {Trim} d */
export function validateTrim(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Trim settings are an object."];
  if (d.baseSides != null && d.baseSides !== 1 && d.baseSides !== 2) e.push("Baseboard sides must be 1 or 2.");
  for (const k of /** @type {const} */ (["baseStock", "casingStock", "shoeStock"])) if (d[k] != null && !(d[k] >= 48 && d[k] <= 240)) e.push(`${k} must be between 48 and 240 inches.`);
  if (d.casingWidth != null && !(d.casingWidth > 0 && d.casingWidth <= 8)) e.push("Casing width must be between 0 and 8 inches.");
  if (d.reveal != null && !(d.reveal >= 0 && d.reveal <= 1)) e.push("Reveal must be between 0 and 1 inch.");
  if (d.scarf != null && !(d.scarf >= 0 && d.scarf <= 12)) e.push("Scarf overlap must be between 0 and 12 inches.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Trim waste must be between 0 and 0.3.");
  return e;
}

/**
 * First-fit decreasing: pieces (inches) into boards of one stock length.
 * A piece longer than the board is split into full boards plus a remainder;
 * each splice is a scarf joint that overlaps `scarf` inches, so a splice
 * costs that much extra board (0 = a plain butt joint).
 * @param {number[]} pieces @param {number} stock @param {number} [scarf]
 */
export function packPieces(pieces, stock, scarf = 0) {
  const cuts = []; let splices = 0;
  for (const p of pieces) { let r = p; while (r > stock + 1e-9) { cuts.push(stock); r -= stock - scarf; splices++; } if (r > 1e-9) cuts.push(r); }
  cuts.sort((a, b) => b - a);
  /** @type {number[]} */ const free = [];
  for (const c of cuts) {
    const i = free.findIndex((f) => f >= c - 1e-9);
    if (i >= 0) free[i] -= c; else free.push(stock - c);
  }
  return { boards: free.length, usedIn: cuts.reduce((s, c) => s + c, 0), splices };
}

/**
 * @param {Trim} d
 * @param {{ walls: { id: string, length: number, sheathed?: boolean, openings?: { kind: string, width: number, height: number, label?: string }[] }[] }} plan
 */
export function layoutTrim(d, plan) {
  const errors = validateTrim(d);
  if (errors.length) return { ok: false, errors };
  const waste = d.waste ?? 0.1, reveal = d.reveal ?? 0.1875, cw = d.casingWidth ?? 2.25;
  const baseStock = d.baseStock ?? 144, casingStock = d.casingStock ?? 96;
  const shoeStock = d.shoeStock ?? 96, scarf = d.scarf ?? 0;
  /** @type {number[]} */ const base = [], casing = [];
  const doors = { n: 0 }, windows = { n: 0 };
  for (const w of plan.walls) {
    const interior = w.sheathed === false;
    const sides = d.baseSides ?? (interior ? 2 : 1);
    const ops = w.openings || [];
    if (d.base !== false) {
      const doorW = ops.filter((o) => o.kind === "door").reduce((s, o) => s + o.width, 0);
      const runs = ops.filter((o) => o.kind === "door").length + 1;
      const net = Math.max(0, w.length - doorW);
      for (let s = 0; s < sides; s++) {
        // net length split evenly over the runs the doors leave; a run longer than the stock splits in packPieces
        for (let r = 0; r < runs; r++) base.push(net / runs);
      }
    }
    if (d.casing !== false) for (const o of ops) {
      const faces = interior ? 2 : 1;
      for (let f = 0; f < faces; f++) {
        const legH = o.height + reveal;
        if (o.kind === "door") { doors.n++; casing.push(legH, legH, o.width + 2 * (cw + reveal)); }
        else { windows.n++; casing.push(legH, legH, o.width + 2 * (cw + reveal), o.width + 2 * reveal); }
      }
    }
  }
  // shoe moulding follows the baseboard runs exactly, in its own stock length
  const b = packPieces(base, baseStock, scarf), c = packPieces(casing, casingStock, scarf), sh = d.shoe ? packPieces(base, shoeStock, scarf) : null;
  const shoeBoards = sh ? Math.ceil(sh.boards * (1 + waste) - 1e-9) : 0;
  const baseBoards = Math.ceil(b.boards * (1 + waste) - 1e-9), casingBoards = Math.ceil(c.boards * (1 + waste) - 1e-9);
  return {
    ok: true, errors: [], waste, reveal, casingWidth: cw, baseStock, casingStock,
    baseFeet: b.usedIn / 12, casingFeet: c.usedIn / 12, baseBoards, casingBoards,
    shoeBoards, shoeStock, shoeFeet: sh ? sh.usedIn / 12 : 0, shoePrice: d.shoePrice ?? null,
    scarf, splices: b.splices + c.splices + (sh ? sh.splices : 0),
    doorFaces: doors.n, windowFaces: windows.n,
    cost: d.basePrice != null || d.casingPrice != null || d.shoePrice != null ? baseBoards * (d.basePrice ?? 0) + casingBoards * (d.casingPrice ?? 0) + shoeBoards * (d.shoePrice ?? 0) : null,
    basePrice: d.basePrice ?? null, casingPrice: d.casingPrice ?? null,
  };
}

/** @param {any} t */
export function trimText(t) {
  const l = [];
  l.push(`  Baseboard: ${t.baseFeet.toFixed(0)} ft in ${t.baseStock / 12} ft boards -> ${t.baseBoards} boards (${(100 * t.waste).toFixed(0)}% waste added)${t.basePrice != null ? `, ${(t.baseBoards * t.basePrice).toFixed(2)} at ${t.basePrice} each` : ""}`);
  l.push(`  Casing: ${t.casingFeet.toFixed(0)} ft for ${t.doorFaces} door faces and ${t.windowFaces} window faces, ${t.casingWidth} in wide with a ${t.reveal} in reveal, in ${t.casingStock / 12} ft boards -> ${t.casingBoards} boards${t.casingPrice != null ? `, ${(t.casingBoards * t.casingPrice).toFixed(2)} at ${t.casingPrice} each` : ""}`);
  if (t.shoeBoards) l.push(`  Shoe moulding: ${t.shoeFeet.toFixed(0)} ft along the baseboard runs in ${t.shoeStock / 12} ft boards -> ${t.shoeBoards} boards${t.shoePrice != null ? `, ${(t.shoeBoards * t.shoePrice).toFixed(2)} at ${t.shoePrice} each` : ""}`);
  if (t.scarf) l.push(`  ${t.splices} splices counted as ${t.scarf} in scarf overlaps.`);
  l.push(`  Mitres, ${t.scarf ? "" : "scarf joints, "}${t.shoeBoards ? "" : "shoe moulding, "}door stops, closets' shelving and exterior trim are not counted; stock lengths, widths and prices are figures you type.`);
  return l;
}
