// @ts-check
// The worked framing takeoff on how-to-do-a-framing-takeoff.html: one house's
// walls taken off step by step, every count on the page computed here from the
// engine's layout of Open House Plans 1 (CC0, generated; fixtures/BSI-LICENSE.md
// lists the fixtures' sources), not typed by hand.
//
//   node takeoff-example.mjs        # prints the figures the page quotes
//
// The steps follow the order a framer works a plan set: wall schedule, plates,
// layout studs, openings, corners and tees, then the piece list turned into a
// board order. takeoff-example.test.mjs pins every figure on the page to this.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";

/** Open House Plans 1 with the tool's default plan settings (16 in on center, 92-5/8 in precut studs). */
export function examplePlan(studSpacing = 16) {
  const r = planFromDxf(readFileSync(new URL("./fixtures/open-house-plans-1.dxf", import.meta.url), "utf8"));
  if (!r.ok) throw new Error(`fixture does not import: ${r.errors?.[0]}`);
  return { ...samplePlan(), ...r.plan, studSpacing };
}

const ROLES = /** @type {const} */ (["stud", "king", "jack", "header", "cripple", "sill", "corner", "tee", "plate"]);

/** @param {number} studSpacing */
export function workedTakeoff(studSpacing = 16) {
  const plan = examplePlan(studSpacing);
  const r = takeoff(plan);
  if (!r.ok) throw new Error(`example does not lay out: ${r.errors?.[0]}`);
  const ext = plan.walls.filter((w) => w.corner);
  const int = plan.walls.filter((w) => !w.corner);
  const feet = (ws) => ws.reduce((s, w) => s + w.length, 0) / 12;
  const openings = plan.walls.flatMap((w) => w.openings ?? []);
  const tees = plan.walls.reduce((s, w) => s + (w.tees?.length ?? 0), 0);

  /** @type {Record<string, number>} */
  const count = Object.fromEntries(ROLES.map((k) => [k, 0]));
  /** @type {Record<string, number>} lineal inches of plate per lumber size */
  const plateInches = {};
  for (const w of r.walls) for (const m of w.members) {
    count[m.kind] = (count[m.kind] ?? 0) + 1;
    if (m.kind === "plate") plateInches[m.size] = (plateInches[m.size] ?? 0) + m.length;
  }
  const plateFeet = Object.fromEntries(Object.entries(plateInches).map(([k, v]) => [k, v / 12]));

  const lines = r.orders.flatMap((o) => o.lines.filter((l) => l.qty > 0).map((l) => ({ size: l.size, length: l.length, label: l.label, qty: l.qty })));
  return {
    plan,
    walls: { exterior: ext.length, exteriorFeet: feet(ext), interior: int.length, interiorFeet: feet(int), totalFeet: feet(plan.walls) },
    openings: { doors: openings.filter((o) => o.kind === "door").length, windows: openings.filter((o) => o.kind === "window").length, wide: openings.filter((o) => o.width > 48).length },
    corners: ext.length, tees,
    count, plateFeet,
    fullHeight: r.summary.fullHeightMembers,
    pieces: r.summary.pieces,
    boards: r.summary.boards,
    boughtFeet: r.summary.boughtFeet,
    neededFeet: r.summary.neededFeet,
    waste: r.summary.waste,
    gap: r.summary.gap,
    lines,
    stockSizes: [...new Set(lines.map((l) => l.size))],
  };
}

/** Feet and inches for a board length in the order table, e.g. 192 -> "16 ft", 92.625 -> "92-5/8 in precut". @param {{length:number,label:string}} l */
export function boardName(l) {
  if (l.label === "precut stud") return "92-5/8 in precut stud";
  return `${l.length / 12} ft`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const sp of [16, 24]) {
    const t = workedTakeoff(sp);
    console.log(`--- ${sp} in on center`);
    console.log("walls", t.walls, "openings", t.openings, "corners", t.corners, "tees", t.tees);
    console.log("members", t.count, "full-height", t.fullHeight, "pieces", t.pieces, "boards", t.boards);
    console.log("plate feet", Object.fromEntries(Object.entries(t.plateFeet).map(([k, v]) => [k, Math.round(v)])));
    console.log(`bought ${t.boughtFeet.toFixed(1)} ft, needed ${t.neededFeet.toFixed(1)} ft, waste ${(t.waste * 100).toFixed(2)}%, gap to bound ${(t.gap * 100).toFixed(2)}%`);
    for (const l of t.lines) console.log(`  ${l.size} ${boardName(l)} x ${l.qty}`);
  }
}
