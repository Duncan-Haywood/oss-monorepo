// @ts-check
// Panelised vs stick framing, from piece counts only. No labour rate is shipped or implied:
// the table counts how many things a crew handles on site, how many saw cuts, and how
// many of the framing nails are driven on site rather than at a shop table.
//
//   node panelised-bench.mjs    # prints the table quoted in README "Panelised vs stick"
//
// Stick: every member is cut and set in place on site; every nail is a site nail.
// Panelised: members are assembled flat on a table (same members, plates trimmed at the
// panel breaks); the site lifts and stands panels, nails the seams between neighbours,
// nails the bottom plate to the floor, and nails the cap plate over the joints. The seam
// rule (face nails along the end stud at `seamSpacing`) is a typed figure, not from a code table.
// Sheathing is left out of both columns. Cut counts include the extra plate pieces a panel
// break makes. Whether panels can be lifted, braced and shipped is the builder's call.
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";
import { panelizeWall, panelParts } from "./panels.mjs";
import { layoutFasteners } from "./fasteners.mjs";

export const SEAM_SPACING = 16; // in: face nails along the stud pair at a panel seam (typed assumption)
export const PANEL_MAXES = [96, 144, 192]; // 8, 12, 16 ft

/**
 * @param {any} plan
 * @param {number[]} [maxes] panel limits, inches
 * @param {number} [seamSpacing]
 */
export function measure(plan, maxes = PANEL_MAXES, seamSpacing = SEAM_SPACING) {
  const r = takeoff(plan);
  if (!r.ok) return { ok: false, errors: r.errors };
  const nails = layoutFasteners({ sheathing: false }, plan, /** @type {any} */ (r));
  if (!nails.ok) return { ok: false, errors: nails.errors };
  const conn = (n) => nails.connections.find((c) => c.name === n)?.nails ?? 0;
  const floorNails = conn("Bottom plate to floor");
  const capNails = conn("Cap plate to top plate");
  const members = r.walls.reduce((t, w) => t + w.members.length, 0);
  const stick = { handled: members, cuts: members, siteNails: nails.total, siteShare: 1, over: false };
  /** @type {{max: number, panels: number, seams: number, cuts: number, handled: number, siteNails: number, siteShare: number, over: boolean}[]} */
  const rows = [];
  for (const max of maxes) {
    let panels = 0, cuts = 0, seams = 0, seamNails = 0, over = false;
    for (const w of r.walls) {
      const pan = panelizeWall(w, max);
      over = over || pan.over;
      panels += pan.panels.length;
      seams += pan.panels.length - 1;
      for (const p of panelParts(w, pan)) cuts += p.pieceCount;
      seamNails += (pan.panels.length - 1) * Math.ceil((w.height ?? plan.studLength ?? 96) / seamSpacing - 1e-9);
    }
    const siteNails = floorNails + capNails + seamNails;
    rows.push({ max, panels, seams, cuts, handled: panels, siteNails, siteShare: siteNails / nails.total, over });
  }
  return { ok: true, members, totalNails: nails.total, stick, rows };
}

const cases = [["example house (invented)", samplePlan()]];
for (const n of [1, 2]) {
  const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
  if (r.ok) cases.push([`Open House Plans ${n} (CC0, generated)`, { ...samplePlan(), ...r.plan }]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, plan] of cases) {
    const m = measure(plan);
    console.log(`\n${name}`);
    if (!m.ok) { console.log(`does not lay out: ${m.errors[0]}`); continue; }
    console.log("method | handled on site | saw cuts | site nails | share of nails on site");
    console.log(`stick | ${m.stick.handled} members | ${m.stick.cuts} | ${m.stick.siteNails} | 100%`);
    for (const r of m.rows) console.log(`panels <= ${r.max / 12} ft${r.over ? " (a panel over the limit)" : ""} | ${r.handled} panels, ${r.seams} seams | ${r.cuts} | ${r.siteNails} | ${(r.siteShare * 100).toFixed(0)}%`);
  }
}
