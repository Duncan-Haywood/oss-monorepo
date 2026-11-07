// @ts-check
// Exterior cement stucco (portland cement plaster) over metal lath: the wall
// area net of openings, the water-resistive barrier, the lath, the three coats
// of plaster, and the metal trim (weep screed, casing bead round openings,
// corner bead, control joints), counted from the walls and openings.
//
// Area comes from the siding layout (same exterior walls, same height, gable
// triangles, openings clipped to the wall), so the two trades agree.
//   Barrier   area x (1 + lap), `layers` deep (default 2, the usual figure for
//             paper-backed stucco over wood framing: confirm with your code),
//             in rolls of `barrierRollSqFt` (default 1350).
//   Lath      area x (1 + lapAllowance) in sheets of `lathSheetSqFt` (default
//             18, a 27 x 96 in sheet), waste added; fasteners every `fastenerSpacing`
//             inches (default 6) along studs at `studSpacing` (default 16).
//   Plaster   area x total coat thickness = volume. Coats default to scratch
//             3/8, brown 3/8, finish 1/8 inch (7/8 in total, the figure commonly
//             required over lath; typed, not looked up). One bag makes
//             `bagYieldCuFt` of wet plaster (default 0.6 cu ft for an 80 lb bag:
//             read your bag), and `rebound` (default 0.15) is the share lost to
//             rebound, mixing and the droop of the wall.
//   Trim      weep screed along the base of every exterior wall; casing bead
//             round each opening (2 x width + 2 x height); corner bead on each
//             outside corner (default 4, full height); control joints: vertical
//             joints so no panel runs longer than `maxRunFt` (default 18) or
//             holds more than `maxPanelSqFt` (default 144), full height. Pieces
//             are packed into `trimStock` inch lengths (default 120) with the
//             first-fit rule the other trades use.
// Not counted: window and door flashing, expansion joints at floors, color
// coat, sealer, scaffolding, labor, and where lath must be double (soffits,
// ceilings). The spacings, thicknesses and yields are figures you type or
// accept as typical; the plaster maker's data sheet and your code win.
import { layoutSiding } from "./siding.mjs";
import { packPieces } from "./trim.mjs";
import { textNumberErrors } from "./numfields.mjs";

const NUMS = ["waste", "barrierLayers", "barrierLap", "barrierRollSqFt", "lathSheetSqFt", "lathLap", "studSpacing", "fastenerSpacing", "scratch", "brown", "finish", "bagYieldCuFt", "bagLb", "rebound", "corners", "maxRunFt", "maxPanelSqFt", "trimStock", "height", "barrierPrice", "lathPrice", "bagPrice", "screedPrice", "casingPrice", "cornerPrice", "jointPrice", "fastenerBoxPrice", "fastenerBoxCount"];

/** @param {any} d */
export function validateStucco(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Stucco settings are an object."];
  const e = textNumberErrors(d, NUMS);
  if (e.length) return e;
  /** @type {(k: string, lo: number, hi: number, msg: string) => void} */
  const range = (k, lo, hi, msg) => { if (d[k] != null && !(d[k] >= lo && d[k] <= hi)) e.push(msg); };
  range("waste", 0, 0.5, "waste must be between 0 and 0.5.");
  if (d.barrierLayers != null && !(Number.isInteger(d.barrierLayers) && d.barrierLayers >= 0 && d.barrierLayers <= 4)) e.push("barrierLayers must be a whole number from 0 to 4.");
  range("barrierLap", 0, 0.5, "barrierLap must be between 0 and 0.5.");
  range("barrierRollSqFt", 50, 3000, "barrierRollSqFt must be between 50 and 3000.");
  range("lathSheetSqFt", 6, 60, "lathSheetSqFt must be between 6 and 60.");
  range("lathLap", 0, 0.5, "lathLap must be between 0 and 0.5.");
  range("studSpacing", 8, 48, "studSpacing must be between 8 and 48 inches.");
  range("fastenerSpacing", 2, 24, "fastenerSpacing must be between 2 and 24 inches.");
  for (const k of ["scratch", "brown", "finish"]) range(k, 0, 1.5, `${k} thickness must be between 0 and 1.5 inches.`);
  range("bagYieldCuFt", 0.1, 3, "bagYieldCuFt must be between 0.1 and 3 cubic feet.");
  range("bagLb", 10, 200, "bagLb must be between 10 and 200 pounds.");
  range("rebound", 0, 0.6, "rebound must be between 0 and 0.6.");
  if (d.corners != null && !(Number.isInteger(d.corners) && d.corners >= 0 && d.corners <= 40)) e.push("corners must be a whole number from 0 to 40.");
  range("maxRunFt", 4, 60, "maxRunFt must be between 4 and 60 feet.");
  range("maxPanelSqFt", 20, 1000, "maxPanelSqFt must be between 20 and 1000.");
  range("trimStock", 48, 240, "trimStock must be between 48 and 240 inches.");
  return e;
}

/**
 * @param {any} d
 * @param {{ studLength: number, defaultHeaderHeight: number, walls: { id: string, length: number, sheathed?: boolean, openings?: { width: number, height: number }[] }[] }} plan
 */
export function layoutStucco(d, plan) {
  const errors = validateStucco(d);
  if (errors.length) return { ok: false, errors };
  const sd = layoutSiding({ height: d.height }, plan);
  if (!sd.ok) return { ok: false, errors: sd.errors.map((/** @type {string} */ m) => m.replace(/^Siding/, "Stucco")) };
  const waste = d.waste ?? 0.1, height = sd.height;
  const netSqFt = sd.netSqFt;
  const layers = d.barrierLayers ?? 2, lap = d.barrierLap ?? 0.1, roll = d.barrierRollSqFt ?? 1350;
  const barrierSqFt = netSqFt * layers * (1 + lap);
  const barrierRolls = layers > 0 ? Math.ceil(barrierSqFt / roll - 1e-9) : 0;
  const sheet = d.lathSheetSqFt ?? 18, lathLap = d.lathLap ?? 0.1;
  const lathSqFt = netSqFt * (1 + lathLap);
  const lathSheets = Math.ceil(lathSqFt / sheet * (1 + waste) - 1e-9);
  const fastenersPerSqFt = 144 / ((d.studSpacing ?? 16) * (d.fastenerSpacing ?? 6));
  const fasteners = Math.ceil(lathSqFt * fastenersPerSqFt * (1 + waste) - 1e-9);
  const coats = { scratch: d.scratch ?? 0.375, brown: d.brown ?? 0.375, finish: d.finish ?? 0.125 };
  const thickness = coats.scratch + coats.brown + coats.finish;
  const volumeCuFt = netSqFt * thickness / 12;
  const rebound = d.rebound ?? 0.15, yieldCuFt = d.bagYieldCuFt ?? 0.6;
  const bags = Math.ceil(volumeCuFt * (1 + rebound) / yieldCuFt - 1e-9);
  const bagLb = d.bagLb ?? 80;

  // Trim pieces, in inches, from the exterior walls the siding counted.
  const maxRun = (d.maxRunFt ?? 18) * 12, maxPanel = d.maxPanelSqFt ?? 144;
  const corners = d.corners ?? 4, stock = d.trimStock ?? 120;
  /** @type {number[]} */ const screed = [], casing = [], cornerBead = [], joints = [];
  let jointCount = 0, openings = 0;
  for (const w of plan.walls) {
    if (w.sheathed === false) continue;
    screed.push(w.length);
    for (const o of w.openings || []) { openings++; casing.push(2 * o.width + 2 * o.height); }
    // panels: no run past maxRun and no panel past maxPanel, evenly divided
    const wallNet = (w.length * height) / 144;
    const cuts = Math.max(Math.ceil(w.length / maxRun - 1e-9), Math.ceil(wallNet / maxPanel - 1e-9)) - 1;
    for (let i = 0; i < cuts; i++) { joints.push(height); jointCount++; }
  }
  for (let i = 0; i < corners; i++) cornerBead.push(height);
  const pack = (/** @type {number[]} */ p) => (p.length ? Math.ceil(packPieces(p, stock).boards * (1 + waste) - 1e-9) : 0);
  const trim = {
    screed: { feet: screed.reduce((s, x) => s + x, 0) / 12, pieces: pack(screed) },
    casing: { openings, feet: casing.reduce((s, x) => s + x, 0) / 12, pieces: pack(casing) },
    corner: { corners, feet: cornerBead.reduce((s, x) => s + x, 0) / 12, pieces: pack(cornerBead) },
    joints: { count: jointCount, feet: joints.reduce((s, x) => s + x, 0) / 12, pieces: pack(joints) },
  };
  /** @param {number | undefined} p @param {number} q */
  const money = (p, q) => (p != null ? p * q : 0);
  const fBox = d.fastenerBoxCount ?? 1000;
  const fastenerBoxes = Math.ceil(fasteners / fBox - 1e-9);
  const priced = ["barrierPrice", "lathPrice", "bagPrice", "screedPrice", "casingPrice", "cornerPrice", "jointPrice", "fastenerBoxPrice"].some((k) => d[k] != null);
  const cost = priced
    ? money(d.barrierPrice, barrierRolls) + money(d.lathPrice, lathSheets) + money(d.bagPrice, bags) + money(d.screedPrice, trim.screed.pieces) +
      money(d.casingPrice, trim.casing.pieces) + money(d.cornerPrice, trim.corner.pieces) + money(d.jointPrice, trim.joints.pieces) + money(d.fastenerBoxPrice, fastenerBoxes)
    : null;
  return {
    ok: true, errors: [], walls: sd.walls, height, netSqFt, openingSqFt: sd.openingSqFt, waste,
    barrier: { layers, sqFt: barrierSqFt, rollSqFt: roll, rolls: barrierRolls },
    lath: { sqFt: lathSqFt, sheetSqFt: sheet, sheets: lathSheets, fasteners, fastenerBoxes, fastenerBoxCount: fBox },
    plaster: { coats, thickness, volumeCuFt, rebound, bagYieldCuFt: yieldCuFt, bagLb, bags, totalLb: bags * bagLb },
    trim, trimStock: stock, cost,
  };
}

/** @param {any} s */
export function stuccoText(s) {
  const l = [];
  const c = s.plaster.coats, f = (/** @type {number} */ n) => n.toFixed(0);
  l.push(`  Stucco: ${s.walls} exterior wall(s), ${s.height / 12} ft high, ${f(s.netSqFt)} sq ft net of ${f(s.openingSqFt)} sq ft of openings.`);
  l.push(s.barrier.layers ? `  Barrier: ${s.barrier.layers} layer(s), ${f(s.barrier.sqFt)} sq ft with laps -> ${s.barrier.rolls} roll(s) of ${s.barrier.rollSqFt} sq ft.` : "  Barrier: none counted (0 layers).");
  l.push(`  Lath: ${f(s.lath.sqFt)} sq ft with laps -> ${s.lath.sheets} sheet(s) of ${s.lath.sheetSqFt} sq ft (waste ${(100 * s.waste).toFixed(0)}% added); ${s.lath.fasteners} fasteners -> ${s.lath.fastenerBoxes} box(es) of ${s.lath.fastenerBoxCount}.`);
  l.push(`  Plaster: coats ${c.scratch} + ${c.brown} + ${c.finish} = ${s.plaster.thickness} in over ${f(s.netSqFt)} sq ft = ${s.plaster.volumeCuFt.toFixed(1)} cu ft wet; with ${(100 * s.plaster.rebound).toFixed(0)}% rebound at ${s.plaster.bagYieldCuFt} cu ft per ${s.plaster.bagLb} lb bag -> ${s.plaster.bags} bags (${s.plaster.totalLb.toLocaleString("en-US")} lb).`);
  const t = s.trim, len = s.trimStock / 12;
  l.push(`  Weep screed: ${f(t.screed.feet)} ft along the base -> ${t.screed.pieces} piece(s) of ${len} ft.`);
  l.push(`  Casing bead: ${t.casing.openings} opening(s), ${f(t.casing.feet)} ft -> ${t.casing.pieces} piece(s).`);
  l.push(`  Corner bead: ${t.corner.corners} corner(s), ${f(t.corner.feet)} ft -> ${t.corner.pieces} piece(s).`);
  l.push(`  Control joints: ${t.joints.count} full-height joint(s), ${f(t.joints.feet)} ft -> ${t.joints.pieces} piece(s).`);
  if (s.cost != null) l.push(`  Cost of the lines you priced: ${s.cost.toFixed(2)}.`);
  l.push("  Thicknesses, panel limits, yields and laps are typical figures you can change; check your code, the plaster maker and your lath supplier. Flashing, floor-line joints, color coat, sealer, scaffolding and labor are not counted.");
  return l;
}
