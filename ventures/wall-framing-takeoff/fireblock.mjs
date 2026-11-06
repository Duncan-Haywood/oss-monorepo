// @ts-check
// Fireblocking in tall walls: horizontal blocks that close each stud bay so a
// concealed wall cavity is no taller than the interval you type. The plates
// already close the bottom and top of every wall, so only a wall taller than
// the interval needs rows between them: rows = ceil(height / interval) - 1,
// spaced evenly. Each row is a block in every bay between neighbouring
// full-height vertical members, cut to the clear gap (the bay width), from the
// same stud size as the wall. Blocks are packed into boards with the same
// first-fit-decreasing idea a framer uses on the deck.
//
// The interval is typed, not assumed: model codes commonly set 10 ft for
// vertical spacing of concealed wall spaces, but your jurisdiction, soffits,
// drop ceilings and stair openings add places this does not look at. Not
// checked: fireblocking at ceiling and floor levels, soffits, stairs, chases,
// draftstopping, fire-resistance ratings, and sealing of penetrations.
import { textNumberErrors } from "./numfields.mjs";

/** @typedef {{ intervalFt?: number, boardFt?: number, kerf?: number, waste?: number, boardPrice?: number, rows?: number }} Fireblock */

/** @param {any} d */
export function validateFireblock(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Fireblocking settings are an object."];
  const e = textNumberErrors(d, ["intervalFt", "boardFt", "kerf", "waste", "boardPrice", "rows"]);
  if (e.length) return e;
  if (d.intervalFt != null && !(d.intervalFt >= 2 && d.intervalFt <= 30)) e.push("intervalFt must be between 2 and 30 feet (type your code's figure).");
  if (d.boardFt != null && !(d.boardFt >= 4 && d.boardFt <= 20)) e.push("boardFt must be between 4 and 20 feet.");
  if (d.kerf != null && !(d.kerf >= 0 && d.kerf <= 0.5)) e.push("kerf must be between 0 and 0.5 inch.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.5)) e.push("waste must be between 0 and 0.5.");
  if (d.boardPrice != null && !(d.boardPrice >= 0 && d.boardPrice <= 1e9)) e.push("boardPrice must be 0 or more.");
  if (d.rows != null && !(Number.isInteger(d.rows) && d.rows >= 0 && d.rows <= 10)) e.push("rows must be a whole number from 0 to 10.");
  return e;
}

/**
 * @param {Fireblock} d
 * @param {{ walls: { id: string, height?: number, stud?: string, members: any[] }[] }} result a takeoff or wall layout result
 */
export function layoutFireblock(d, result) {
  const errors = validateFireblock(d);
  if (errors.length) return { ok: false, errors };
  const interval = (d.intervalFt ?? 10) * 12, boardIn = (d.boardFt ?? 8) * 12, kerf = d.kerf ?? 0.125, waste = d.waste ?? 0.05;
  /** @type {{ id: string, size: string, rows: number, bays: number, pieces: number, lengthIn: number }[]} */
  const walls = [];
  /** @type {Map<string, number[]>} */
  const bySize = new Map();
  for (const w of result.walls || []) {
    let top = 0;
    for (const m of w.members || []) top = Math.max(top, m.y + m.h);
    const rows = d.rows ?? Math.max(0, Math.ceil(top / interval - 1e-9) - 1);
    // full-height vertical members, left to right; a bay is the clear gap between neighbours
    const verts = (w.members || []).filter((m) => m.orient === "v" && m.h >= 0.9 * (top - 3)).sort((a, b) => a.x - b.x);
    const gaps = [];
    for (let i = 1; i < verts.length; i++) {
      const g = verts[i].x - (verts[i - 1].x + verts[i - 1].w);
      if (g > 0.25) gaps.push(g);
    }
    const size = w.stud || "2x4";
    const list = bySize.get(size) || [];
    let lengthIn = 0, pieces = 0;
    for (let r = 0; r < rows; r++) for (const g of gaps) { list.push(g); lengthIn += g; pieces++; }
    bySize.set(size, list);
    walls.push({ id: w.id, size, rows, bays: gaps.length, pieces, lengthIn });
  }
  const sizes = [];
  for (const [size, pcs] of bySize) {
    const sorted = pcs.filter((p) => p <= boardIn).sort((a, b) => b - a);
    const tooLong = pcs.length - sorted.length;
    /** @type {number[]} */ const free = [];
    for (const p of sorted) {
      const i = free.findIndex((f) => f + 1e-9 >= p + kerf);
      if (i >= 0) free[i] -= p + kerf; else free.push(boardIn - p - kerf);
    }
    const exact = free.length;
    const boards = pcs.length ? Math.ceil(exact * (1 + waste) - 1e-9) : 0;
    sizes.push({ size, pieces: pcs.length, lengthFt: pcs.reduce((s, p) => s + p, 0) / 12, boardsPacked: exact, boards, tooLong });
  }
  const boards = sizes.reduce((s, x) => s + x.boards, 0);
  return {
    ok: true, errors: [], intervalFt: interval / 12, boardFt: boardIn / 12, waste, walls, sizes,
    rowsTotal: walls.reduce((s, w) => s + w.rows, 0), pieces: walls.reduce((s, w) => s + w.pieces, 0), boards,
    boardPrice: d.boardPrice ?? null,
    cost: d.boardPrice != null ? boards * d.boardPrice : null,
  };
}

/** @param {any} f */
export function fireblockText(f) {
  const l = [];
  if (!f.pieces) {
    l.push(`  No wall is taller than ${f.intervalFt} ft, so the plates already close every cavity: no blocking rows.`);
  } else {
    l.push(`  Cavity limit ${f.intervalFt} ft: ${f.rowsTotal} block rows, ${f.pieces} blocks cut to the bay width.`);
    for (const w of f.walls) if (w.rows) l.push(`    ${w.id}: ${w.rows} row${w.rows > 1 ? "s" : ""} x ${w.bays} bays = ${w.pieces} blocks`);
    for (const s of f.sizes) l.push(`  ${s.size}: ${s.lengthFt.toFixed(1)} ft in blocks -> ${s.boardsPacked} ${f.boardFt}-ft boards packed, buy ${s.boards} (${(100 * f.waste).toFixed(0)}% waste)${s.tooLong ? `; ${s.tooLong} blocks are longer than a board` : ""}`);
    if (f.cost != null) l.push(`  Cost: ${f.cost.toFixed(2)}.`);
  }
  l.push("  The interval is the figure you typed. Ceiling and floor levels, soffits, stairs, chases and penetrations are not looked at; confirm with your inspector.");
  return l;
}
