// A small study with the engine, for the README and the write-up:
//   node verify/study.mjs > data/study.txt
// 1. What does each style and priority cost for one program (3 bed, 2 bath, 1,400 sq ft)?
// 2. How does the modelled cost per sq ft fall with size?
// 3. How much better is the searched layout than a typical rule-passing one?
// 4. Advanced against conventional framing: wall lumber.
// All costs are the NAHB-anchored model (cost.mjs), in 2024 dollars, not quotes.

import { design } from "../engine.mjs";
import { normalizeBrief } from "../brief.mjs";
import { searchDesigns } from "../search.mjs";
import { STYLES } from "../styles.mjs";

const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
const out = [];
const P = (s = "") => out.push(s);

P("1. Style and priority, 3 bed / 2 bath, 1,400 sq ft asked, slab, US average");
P("style        priority   footprint  sq ft   cost       $/sq ft  facade sym  daylight");
for (const style of Object.keys(STYLES)) for (const priority of ["budget", "beauty"]) {
  const r = design({ beds: 3, baths: 2, area: 1400, style, priority }).design;
  P(`${style.padEnd(12)} ${priority.padEnd(10)} ${`${r.footprint.width}x${r.footprint.depth}`.padEnd(10)} ${String(r.footprint.conditioned).padEnd(7)} ${money(r.cost.total).padEnd(10)} ${String(r.cost.perSqFt).padEnd(8)} ${r.scores.facade.symmetry.toFixed(2).padEnd(11)} ${r.scores.daylight.toFixed(2)}`);
}

P("\n2. Size: 3 bed / 2 bath, minimal style, budget priority");
P("asked   got     footprint  cost       $/sq ft");
for (const area of [1000, 1200, 1400, 1600, 1800, 2000, 2200]) {
  const r = design({ beds: 3, baths: 2, area, style: "minimal", priority: "budget" }).design;
  P(`${String(area).padEnd(7)} ${String(r.footprint.conditioned).padEnd(7)} ${`${r.footprint.width}x${r.footprint.depth}`.padEnd(10)} ${money(r.cost.total).padEnd(10)} ${r.cost.perSqFt}`);
}

P("\n3. Search against a typical rule-passing layout (stage A skeletons, same brief)");
P("brief                         candidates  passing  best score  median score  best $/sq ft  median $/sq ft");
for (const b0 of [{ beds: 2 }, { beds: 3 }, { beds: 3, priority: "budget" }, { beds: 4, garage: 2 }, { beds: 5 }]) {
  const { brief } = normalizeBrief(b0);
  const scores = [], psf = [];
  const r = searchDesigns(brief, { keep: 1, trace: (p, s) => { scores.push(s.total); psf.push(s.cost.perSqFt); } });
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const best = r.designs[0];
  P(`${JSON.stringify(b0).padEnd(29)} ${String(r.evaluated).padEnd(11)} ${String(r.feasible).padEnd(8)} ${best.score.total.toFixed(2).padEnd(11)} ${med(scores).toFixed(2).padEnd(13)} ${Math.round(best.score.cost.perSqFt).toString().padEnd(13)} ${Math.round(med(psf))}`);
}

P("\n4. Wall framing lumber, advanced (2x6 @ 24 in) against conventional (2x4 @ 16 in)");
P("program        advanced bf  conventional bf  saving");
for (const beds of [1, 2, 3, 4]) {
  const a = design({ beds, frame: "advanced", style: "minimal" }).design.framing;
  const c = design({ beds, frame: "conventional", style: "minimal" }).design.framing;
  P(`${`${beds} bed`.padEnd(14)} ${String(a.wallLumberBf).padEnd(12)} ${String(c.wallLumberBf).padEnd(16)} ${Math.round((100 * (c.wallLumberBf - a.wallLumberBf)) / c.wallLumberBf)}%`);
}
P("\n5. Single choices on the 3 bed / 2 bath / 1,400 sq ft farmhouse (balanced)");
P("change                      cost       difference");
const base = design({ beds: 3, baths: 2, area: 1400, style: "farmhouse" }).design.cost.total;
P(`${"as designed (porch, slab)".padEnd(27)} ${money(base).padEnd(10)}`);
for (const [label, b] of [["no porch", { porch: false }], ["crawlspace", { foundation: "crawl" }], ["two-car garage", { garage: 2 }], ["basic finishes", { finish: "basic" }], ["premium finishes", { finish: "premium" }], ["9 ft -> 8 ft ceilings", { ceiling: 8 }], ["accessible", { accessible: true }]]) {
  const c = design({ beds: 3, baths: 2, area: 1400, style: "farmhouse", ...b }).design.cost.total;
  P(`${label.padEnd(27)} ${money(c).padEnd(10)} ${c >= base ? "+" : "-"}${money(Math.abs(c - base))} (${(100 * (c - base) / base).toFixed(1)}%)`);
}
console.log(out.join("\n"));
