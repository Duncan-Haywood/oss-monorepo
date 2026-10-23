// @ts-check
// Upper bound on reusing opening cut-outs as sheathing pieces (ROADMAP "2D reuse
// of opening cut-outs"). For the sample house it counts the panels that fit,
// by width and height, inside a cut-out rectangle that is a free-standing
// hole (not a notch off a panel edge), and the sheets the order would shed if
// each such panel were free.
//
//   node cutout-reuse-bench.mjs
import { takeoff, samplePlan } from "./engine.mjs";
import { sheathe, defaultSheathing } from "./sheathing.mjs";

const EPS = 1e-6;
for (const orientation of ["vertical", "horizontal"]) {
  const plan = samplePlan();
  plan.sheathing = { ...defaultSheathing(), orientation };
  const s = sheathe(plan, takeoff(plan));
  const panels = s.walls.flatMap((w) => w.panels);
  const holes = [];
  for (const p of panels) {
    for (const c of p.cutouts) {
      const interior = c.x0 > EPS && c.x1 < p.width - EPS && c.y0 > p.y0 + EPS && c.y1 < p.y0 + p.height - EPS;
      if (interior) holes.push({ w: c.x1 - c.x0, h: c.y1 - c.y0 });
    }
  }
  const used = new Set();
  const free = [];
  for (const p of [...panels].sort((a, b) => b.width * b.height - a.width * a.height)) {
    const i = holes.findIndex((c, k) => !used.has(k) && ((c.w >= p.width && c.h >= p.height) || (c.h >= p.width && c.w >= p.height)));
    if (i >= 0) { used.add(i); free.push(p.id); }
  }
  console.log(`${orientation}: ${panels.length} panels, ${s.summary.sheets} sheets; free-standing holes ${holes.length}; panels that fit one: ${free.length}${free.length ? ` (${free.join(", ")})` : ""}`);
}
