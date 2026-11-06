// @ts-check
// Plumbing rough-in quantities from fixtures you list, with the pipe runs you
// type for each. Nothing here is a code table: the lengths, fixture units and
// fitting counts are the plumber's own numbers, and the module only adds them
// up into an order (drain and vent sticks, PEX coils, traps, stops, fittings).
//
// Not counted or checked: pipe sizing, trap-arm and vent distances, slope,
// fixture-unit limits, water heater, meter, main and building sewer, and local
// code. A fixture's `dfu` is summed if you type it; it is not looked up.

import { textNumberErrors } from "./numfields.mjs";

/** @typedef {{ id?: string, name?: string, count?: number, drainFt?: number, ventFt?: number, hotFt?: number, coldFt?: number, drainFittings?: number, supplyFittings?: number, stops?: number, trap?: boolean, dfu?: number }} Fixture */
/** @typedef {{ fixtures?: Fixture[], drainStickFt?: number, pexCoilFt?: number, waste?: number, drainPipePrice?: number, pexCoilPrice?: number, trapPrice?: number, stopPrice?: number, drainFittingPrice?: number, supplyFittingPrice?: number, drainHangerSpacingFt?: number, supplyStrapSpacingFt?: number, hangerPrice?: number, strapPrice?: number }} Plumbing */

const NUM = ["drainStickFt", "pexCoilFt", "waste", "drainPipePrice", "pexCoilPrice", "trapPrice", "stopPrice", "drainFittingPrice", "supplyFittingPrice", "drainHangerSpacingFt", "supplyStrapSpacingFt", "hangerPrice", "strapPrice"];

/** @param {any} d */
export function validatePlumbing(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Plumbing settings are an object."];
  const e = textNumberErrors(d, NUM);
  if (e.length) return e;
  if (!Array.isArray(d.fixtures) || d.fixtures.length === 0) e.push("plumbing.fixtures is a list with at least one fixture.");
  if (d.drainStickFt != null && !(d.drainStickFt >= 5 && d.drainStickFt <= 40)) e.push("drainStickFt must be between 5 and 40 feet (stock is 10 or 20).");
  if (d.pexCoilFt != null && !(d.pexCoilFt >= 25 && d.pexCoilFt <= 1000)) e.push("pexCoilFt must be between 25 and 1000 feet.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.5)) e.push("waste must be between 0 and 0.5.");
  for (const k of ["drainHangerSpacingFt", "supplyStrapSpacingFt"]) if (d[k] != null && !(d[k] >= 0.5 && d[k] <= 20)) e.push(`${k} must be between 0.5 and 20 feet (type your code's figure).`);
  for (const k of NUM) if (d[k] != null && !(typeof d[k] === "number" && d[k] >= 0)) e.push(`${k} must be 0 or more.`);
  if (Array.isArray(d.fixtures)) d.fixtures.forEach((/** @type {any} */ f, i) => {
    const n = `Fixture ${f && f.id ? f.id : i + 1}`;
    if (f == null || typeof f !== "object" || Array.isArray(f)) { e.push(`${n} is an object.`); return; }
    for (const k of ["id", "name"]) if (f[k] != null && (typeof f[k] !== "string" || f[k].length > 80)) { e.push(`${n}: ${k} is text up to 80 characters.`); return; }
    const t = textNumberErrors(f, ["count", "drainFt", "ventFt", "hotFt", "coldFt", "drainFittings", "supplyFittings", "stops", "dfu"]);
    if (t.length) { e.push(...t.map((x) => `${n}: ${x}`)); return; }
    if (f.count != null && !(Number.isInteger(f.count) && f.count >= 1 && f.count <= 100)) e.push(`${n}: count must be a whole number 1 to 100.`);
    for (const k of ["drainFt", "ventFt", "hotFt", "coldFt", "drainFittings", "supplyFittings", "stops", "dfu"]) if (f[k] != null && !(typeof f[k] === "number" && f[k] >= 0 && f[k] <= 1000)) e.push(`${n}: ${k} must be 0 to 1000.`);
    for (const k of ["drainFittings", "supplyFittings", "stops"]) if (f[k] != null && !Number.isInteger(f[k])) e.push(`${n}: ${k} must be a whole number.`);
    if (f.trap != null && typeof f.trap !== "boolean") e.push(`${n}: trap is true or false.`);
  });
  return e;
}

/** @param {Plumbing} d */
export function layoutPlumbing(d) {
  const errors = validatePlumbing(d);
  if (errors.length) return { ok: false, errors };
  const stickFt = d.drainStickFt ?? 10, coilFt = d.pexCoilFt ?? 100, waste = d.waste ?? 0.1;
  let drainFt = 0, ventFt = 0, hotFt = 0, coldFt = 0, traps = 0, stops = 0, drainFittings = 0, supplyFittings = 0, dfu = 0, fixtureCount = 0, dfuTyped = false;
  const perFixture = (d.fixtures || []).map((f, i) => {
    const c = f.count ?? 1;
    const hasDrain = (f.drainFt ?? 0) > 0 || f.trap === true;
    const r = {
      id: f.id ?? f.name ?? `fixture ${i + 1}`, count: c,
      drainFt: c * (f.drainFt ?? 0), ventFt: c * (f.ventFt ?? 0), hotFt: c * (f.hotFt ?? 0), coldFt: c * (f.coldFt ?? 0),
      traps: f.trap === false ? 0 : hasDrain ? c : 0,
      stops: c * (f.stops ?? ((f.hotFt ?? 0) > 0 ? 1 : 0) + ((f.coldFt ?? 0) > 0 ? 1 : 0)),
      drainFittings: c * (f.drainFittings ?? 0), supplyFittings: c * (f.supplyFittings ?? 0), dfu: c * (f.dfu ?? 0),
    };
    if (f.dfu != null) dfuTyped = true;
    drainFt += r.drainFt; ventFt += r.ventFt; hotFt += r.hotFt; coldFt += r.coldFt; traps += r.traps; stops += r.stops;
    drainFittings += r.drainFittings; supplyFittings += r.supplyFittings; dfu += r.dfu; fixtureCount += c;
    return r;
  });
  const EPS = 1e-9;
  const drainTotal = drainFt + ventFt;
  const drainSticks = drainTotal ? Math.ceil(drainTotal * (1 + waste) / stickFt - EPS) : 0;
  const hotCoils = hotFt ? Math.ceil(hotFt * (1 + waste) / coilFt - EPS) : 0;
  const coldCoils = coldFt ? Math.ceil(coldFt * (1 + waste) / coilFt - EPS) : 0;
  // Supports are opt-in and use the spacing you type (no code table is built in): one per spacing along each run total, rounded up.
  const hangers = d.drainHangerSpacingFt && drainTotal ? Math.ceil(drainTotal / d.drainHangerSpacingFt - EPS) : 0;
  const straps = d.supplyStrapSpacingFt && (hotFt + coldFt) ? Math.ceil((hotFt + coldFt) / d.supplyStrapSpacingFt - EPS) : 0;
  const priced = ["drainPipePrice", "pexCoilPrice", "trapPrice", "stopPrice", "drainFittingPrice", "supplyFittingPrice", "hangerPrice", "strapPrice"].some((k) => /** @type {any} */ (d)[k] != null);
  const cost = priced ? drainSticks * (d.drainPipePrice ?? 0) + (hotCoils + coldCoils) * (d.pexCoilPrice ?? 0) + traps * (d.trapPrice ?? 0) + stops * (d.stopPrice ?? 0) + drainFittings * (d.drainFittingPrice ?? 0) + supplyFittings * (d.supplyFittingPrice ?? 0) + hangers * (d.hangerPrice ?? 0) + straps * (d.strapPrice ?? 0) : null;
  return {
    ok: true, errors: [], fixtureCount, perFixture, drainFt, ventFt, drainTotal, hotFt, coldFt, waste,
    drainStickFt: stickFt, drainSticks, pexCoilFt: coilFt, hotCoils, coldCoils, traps, stops, drainFittings, supplyFittings, hangers, straps, drainHangerSpacingFt: d.drainHangerSpacingFt ?? null, supplyStrapSpacingFt: d.supplyStrapSpacingFt ?? null,
    dfu: dfuTyped ? dfu : null, cost,
    prices: { drainPipe: d.drainPipePrice ?? null, pexCoil: d.pexCoilPrice ?? null, trap: d.trapPrice ?? null, stop: d.stopPrice ?? null, drainFitting: d.drainFittingPrice ?? null, supplyFitting: d.supplyFittingPrice ?? null, hanger: d.hangerPrice ?? null, strap: d.strapPrice ?? null },
  };
}

/** @param {any} t */
export function plumbingText(t) {
  const l = [];
  l.push(`  ${t.fixtureCount} fixtures: ${t.drainFt} ft drain + ${t.ventFt} ft vent -> ${t.drainSticks} sticks of ${t.drainStickFt} ft (plus ${(100 * t.waste).toFixed(0)}% waste).`);
  l.push(`  Supply: ${t.hotFt} ft hot -> ${t.hotCoils} coils, ${t.coldFt} ft cold -> ${t.coldCoils} coils of ${t.pexCoilFt} ft.`);
  l.push(`  ${t.traps} traps, ${t.stops} stops, ${t.drainFittings} drain fittings, ${t.supplyFittings} supply fittings${t.dfu != null ? `; ${t.dfu} drainage fixture units as typed` : ""}${t.cost != null ? `; cost ${t.cost.toFixed(2)}` : ""}.`);
  if (t.hangers || t.straps) l.push(`  Supports at the spacing you typed: ${t.hangers} drain hangers, ${t.straps} supply straps.`);
  l.push("  Pipe sizes, trap-arm and vent distances, slope, fixture-unit limits, the water heater, main and sewer are not checked; every length and fitting count is typed.");
  return l;
}
