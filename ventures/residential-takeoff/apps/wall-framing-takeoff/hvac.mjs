// @ts-check
// HVAC duct rough-in quantities from rooms you list, with the duct runs you type
// for each. Nothing here is a code table or a load calculation: lengths, outlet
// counts and fitting counts are the HVAC contractor's own numbers (from their
// Manual J/D or their own layout), and the module only adds them up into an order
// (rigid trunk sticks, flex rolls, boots, registers, return grilles, fittings,
// supports, sealing tape).
//
// Not counted or checked: heating and cooling loads, equipment size, duct sizing,
// static pressure, airflow balance, ventilation rates, duct leakage limits, the
// air handler, condenser, line set, and local code.

import { textNumberErrors } from "./numfields.mjs";

/** @typedef {{ id?: string, name?: string, count?: number, supplyFt?: number, returnFt?: number, registers?: number, boots?: number, returnGrilles?: number, fittings?: number }} Room */
/** @typedef {{ rooms?: Room[], trunkFt?: number, trunkStickFt?: number, flexRollFt?: number, waste?: number, trunkFittings?: number, supportSpacingFt?: number, tapeRollFt?: number, tapeFtPerDuctFt?: number, trunkPrice?: number, flexRollPrice?: number, bootPrice?: number, registerPrice?: number, returnGrillePrice?: number, fittingPrice?: number, supportPrice?: number, tapeRollPrice?: number }} Hvac */

const NUM = ["trunkFt", "trunkStickFt", "flexRollFt", "waste", "trunkFittings", "supportSpacingFt", "tapeRollFt", "tapeFtPerDuctFt", "trunkPrice", "flexRollPrice", "bootPrice", "registerPrice", "returnGrillePrice", "fittingPrice", "supportPrice", "tapeRollPrice"];
const ROOM_NUM = ["count", "supplyFt", "returnFt", "registers", "boots", "returnGrilles", "fittings"];

/** @param {any} d */
export function validateHvac(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["HVAC settings are an object."];
  const e = textNumberErrors(d, NUM);
  if (e.length) return e;
  if (!Array.isArray(d.rooms) || d.rooms.length === 0) e.push("hvac.rooms is a list with at least one room.");
  if (d.trunkStickFt != null && !(d.trunkStickFt >= 2 && d.trunkStickFt <= 12)) e.push("trunkStickFt must be between 2 and 12 feet (rigid duct is commonly 5).");
  if (d.flexRollFt != null && !(d.flexRollFt >= 10 && d.flexRollFt <= 100)) e.push("flexRollFt must be between 10 and 100 feet (flex duct is commonly 25).");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.5)) e.push("waste must be between 0 and 0.5.");
  if (d.supportSpacingFt != null && !(d.supportSpacingFt >= 0.5 && d.supportSpacingFt <= 20)) e.push("supportSpacingFt must be between 0.5 and 20 feet (type your code's figure).");
  if (d.tapeRollFt != null && !(d.tapeRollFt >= 10 && d.tapeRollFt <= 500)) e.push("tapeRollFt must be between 10 and 500 feet.");
  if (d.tapeFtPerDuctFt != null && !(d.tapeFtPerDuctFt >= 0 && d.tapeFtPerDuctFt <= 5)) e.push("tapeFtPerDuctFt must be between 0 and 5 (feet of tape per foot of duct, from your own joint count).");
  for (const k of NUM) if (d[k] != null && !(typeof d[k] === "number" && d[k] >= 0)) e.push(`${k} must be 0 or more.`);
  if (d.trunkFt != null && d.trunkFt > 2000) e.push("trunkFt must be 2000 or less.");
  if (d.trunkFittings != null && !Number.isInteger(d.trunkFittings)) e.push("trunkFittings must be a whole number.");
  if (Array.isArray(d.rooms)) d.rooms.forEach((/** @type {any} */ f, i) => {
    const n = `Room ${f && (f.id || f.name) ? f.id || f.name : i + 1}`;
    if (f == null || typeof f !== "object" || Array.isArray(f)) { e.push(`${n} is an object.`); return; }
    for (const k of ["id", "name"]) if (f[k] != null && (typeof f[k] !== "string" || f[k].length > 80)) { e.push(`${n}: ${k} is text up to 80 characters.`); return; }
    const t = textNumberErrors(f, ROOM_NUM);
    if (t.length) { e.push(...t.map((x) => `${n}: ${x}`)); return; }
    if (f.count != null && !(Number.isInteger(f.count) && f.count >= 1 && f.count <= 100)) e.push(`${n}: count must be a whole number 1 to 100.`);
    for (const k of ROOM_NUM.slice(1)) if (f[k] != null && !(typeof f[k] === "number" && f[k] >= 0 && f[k] <= 1000)) e.push(`${n}: ${k} must be 0 to 1000.`);
    for (const k of ["registers", "boots", "returnGrilles", "fittings"]) if (f[k] != null && !Number.isInteger(f[k])) e.push(`${n}: ${k} must be a whole number.`);
  });
  return e;
}

/** @param {Hvac} d */
export function layoutHvac(d) {
  const errors = validateHvac(d);
  if (errors.length) return { ok: false, errors };
  const stickFt = d.trunkStickFt ?? 5, rollFt = d.flexRollFt ?? 25, waste = d.waste ?? 0.1;
  const trunkFt = d.trunkFt ?? 0;
  let supplyFt = 0, returnFt = 0, registers = 0, boots = 0, returnGrilles = 0, fittings = d.trunkFittings ?? 0, roomCount = 0;
  const perRoom = (d.rooms || []).map((f, i) => {
    const c = f.count ?? 1;
    const reg = c * (f.registers ?? ((f.supplyFt ?? 0) > 0 ? 1 : 0));
    const r = {
      id: f.id ?? f.name ?? `room ${i + 1}`, count: c,
      supplyFt: c * (f.supplyFt ?? 0), returnFt: c * (f.returnFt ?? 0),
      registers: reg, boots: f.boots != null ? c * f.boots : reg,
      returnGrilles: c * (f.returnGrilles ?? ((f.returnFt ?? 0) > 0 ? 1 : 0)),
      fittings: c * (f.fittings ?? 0),
    };
    supplyFt += r.supplyFt; returnFt += r.returnFt; registers += r.registers; boots += r.boots; returnGrilles += r.returnGrilles; fittings += r.fittings; roomCount += c;
    return r;
  });
  const EPS = 1e-9;
  const flexFt = supplyFt + returnFt;
  const trunkSticks = trunkFt ? Math.ceil(trunkFt * (1 + waste) / stickFt - EPS) : 0;
  const flexRolls = flexFt ? Math.ceil(flexFt * (1 + waste) / rollFt - EPS) : 0;
  const ductFt = trunkFt + flexFt;
  // Supports and tape are opt-in: the spacing and the tape-per-duct-foot ratio are typed, no code table is built in.
  const supports = d.supportSpacingFt && ductFt ? Math.ceil(ductFt / d.supportSpacingFt - EPS) : 0;
  const tapeFt = d.tapeFtPerDuctFt && ductFt ? ductFt * d.tapeFtPerDuctFt : 0;
  const tapeRolls = tapeFt && d.tapeRollFt ? Math.ceil(tapeFt / d.tapeRollFt - EPS) : 0;
  const priced = ["trunkPrice", "flexRollPrice", "bootPrice", "registerPrice", "returnGrillePrice", "fittingPrice", "supportPrice", "tapeRollPrice"].some((k) => /** @type {any} */ (d)[k] != null);
  const cost = priced ? trunkSticks * (d.trunkPrice ?? 0) + flexRolls * (d.flexRollPrice ?? 0) + boots * (d.bootPrice ?? 0) + registers * (d.registerPrice ?? 0) + returnGrilles * (d.returnGrillePrice ?? 0) + fittings * (d.fittingPrice ?? 0) + supports * (d.supportPrice ?? 0) + tapeRolls * (d.tapeRollPrice ?? 0) : null;
  return {
    ok: true, errors: [], roomCount, perRoom, supplyFt, returnFt, flexFt, trunkFt, ductFt, waste,
    trunkStickFt: stickFt, trunkSticks, flexRollFt: rollFt, flexRolls, boots, registers, returnGrilles, fittings,
    supports, supportSpacingFt: d.supportSpacingFt ?? null, tapeFt, tapeRolls, tapeRollFt: d.tapeRollFt ?? null, cost,
    prices: { trunk: d.trunkPrice ?? null, flexRoll: d.flexRollPrice ?? null, boot: d.bootPrice ?? null, register: d.registerPrice ?? null, returnGrille: d.returnGrillePrice ?? null, fitting: d.fittingPrice ?? null, support: d.supportPrice ?? null, tapeRoll: d.tapeRollPrice ?? null },
  };
}

/** @param {any} t */
export function hvacText(t) {
  const l = [];
  l.push(`  ${t.roomCount} rooms: ${t.supplyFt} ft supply + ${t.returnFt} ft return flex -> ${t.flexRolls} rolls of ${t.flexRollFt} ft; ${t.trunkFt} ft rigid trunk -> ${t.trunkSticks} sticks of ${t.trunkStickFt} ft (plus ${(100 * t.waste).toFixed(0)}% waste).`);
  l.push(`  ${t.boots} boots, ${t.registers} registers, ${t.returnGrilles} return grilles, ${t.fittings} fittings${t.cost != null ? `; cost ${t.cost.toFixed(2)}` : ""}.`);
  if (t.supports) l.push(`  Supports at the spacing you typed: ${t.supports} hangers or straps.`);
  if (t.tapeRolls) l.push(`  Sealing tape at the ratio you typed: ${t.tapeFt.toFixed(0)} ft, ${t.tapeRolls} rolls.`);
  l.push("  Loads, equipment and duct sizing, airflow balance, leakage limits, the air handler, condenser and line set are not checked; every length and count is typed.");
  return l;
}
