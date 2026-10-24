// Do the cost findings survive the cost model's assumptions?
//   node verify/sensitivity.mjs > data/sensitivity.txt
//
// cost.mjs anchors on one survey and assumes the rest: how each stage splits
// over its drivers, the reference house's geometry, and the porch, foundation
// and finish factors. This draws 500 sets of those assumptions (each driver
// weight times a uniform factor in [0.5, 1.5], renormalised per stage; the
// reference house's storeys, glazing, fixtures, wall height, pitch and garage
// across plausible ranges; the porch, crawlspace and slab factors widened by
// half either way) and recomputes the study's findings on fixed designs. A
// finding survives when its sign and rough size hold from the 5th to the 95th
// percentile. Seeded, so the output is reproducible.

import { design } from "../engine.mjs";
import { normalizeBrief } from "../brief.mjs";
import { searchDesigns } from "../search.mjs";
import { STYLES } from "../styles.mjs";
import { program, buildSkeleton } from "../layout.mjs";
import { planDrivers, estimate, ASSUMPTIONS } from "../cost.mjs";
import { porchSpec } from "../search.mjs";

let seed = 20261021;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const U = (a, b) => a + (b - a) * rnd();

function draw() {
  const drivers = {};
  for (const [stage, split] of Object.entries(ASSUMPTIONS.drivers)) {
    const w = Object.fromEntries(Object.entries(split).map(([k, v]) => [k, v * U(0.5, 1.5)]));
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    drivers[stage] = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum]));
  }
  return {
    drivers,
    ref: { storeys: U(1.5, 2), aspect: U(1.2, 1.8), garageSide: U(20, 24), wallHeight: U(9, 10.5), pitch: U(4, 8), overhang: U(0.75, 1.5), partitionsPerSqFt: U(0.09, 0.15), fixtures: Math.round(U(10, 16)), glazing: U(0.12, 0.18) },
    finish: ASSUMPTIONS.finish,
    foundation: { slab: U(0.7, 1.0), crawl: U(0.95, 1.2) },
    porchShare: U(0.15, 0.45),
  };
}

// fixed designs: drivers measured once, priced under each draw
const designDrivers = (b0) => {
  const { brief } = normalizeBrief(b0);
  const r = searchDesigns(brief, { keep: 1 });
  const plan = r.designs[0].plan;
  const style = STYLES[brief.style];
  return { brief, d: planDrivers(plan, brief, style), porch: plan.porch ? plan.porch.w * plan.porch.d : 0 };
};
const small = designDrivers({ beds: 3, baths: 2, area: 1000, style: "minimal", priority: "budget" });
const large = designDrivers({ beds: 3, baths: 2, area: 2200, style: "minimal", priority: "budget" });
const farm = designDrivers({ beds: 3, baths: 2, area: 1400, style: "farmhouse" });
const mini = designDrivers({ beds: 3, baths: 2, area: 1400, style: "minimal" });
const crawl = designDrivers({ beds: 3, baths: 2, area: 1400, style: "farmhouse", foundation: "crawl" });
const garage = designDrivers({ beds: 3, baths: 2, area: 1400, style: "farmhouse", garage: 2 });

// every rule-passing skeleton of one brief, for the layout spread
const { brief: b3 } = normalizeBrief({ beds: 3 });
const st3 = STYLES[b3.style], prog3 = program(b3);
const skels = [];
searchDesigns(b3, { keep: 1, trace: (p) => skels.push(p) });
const skelDrivers = skels.map((p) => { const sk = buildSkeleton(p, prog3); return { d: planDrivers(sk, b3, st3), porch: (() => { const ps = porchSpec(sk, b3, st3); return ps ? ps.w * ps.d : 0; })() }; });

const cost = (x, a) => estimate(x.d, x.brief || b3, x.porch, a);
const rows = { size: [], style: [], porch: [], crawl: [], garage: [], layout: [] };
for (let i = 0; i < 500; i++) {
  const a = draw();
  rows.size.push(cost(small, a).perSqFt / cost(large, a).perSqFt);
  rows.style.push(100 * (cost(farm, a).perSqFt / cost(mini, a).perSqFt - 1));
  rows.porch.push(farm.porch * (428215 / 2647) * a.porchShare);
  rows.crawl.push(100 * (cost(crawl, a).total / cost(farm, a).total - 1));
  rows.garage.push(100 * (cost(garage, a).total / cost(farm, a).total - 1));
  const psf = skelDrivers.map((x) => estimate(x.d, b3, x.porch, a).perSqFt).sort((p, q) => p - q);
  rows.layout.push(100 * (psf[psf.length - 1] / psf[0] - 1)); // widest spread: dearest vs cheapest rule-passing layout
}
const pct = (arr, q) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmt = (v, unit) => (unit === "$" ? "$" + Math.round(v).toLocaleString("en-US") : v.toFixed(unit === "x" ? 2 : 1) + unit);
const line = (label, arr, unit, base) => `${label.padEnd(60)} ${base.padEnd(9)} ${[0.05, 0.5, 0.95].map((q) => fmt(pct(arr, q), unit).padStart(9)).join(" ")}`;
const base = {
  size: (estimate(small.d, small.brief, small.porch).perSqFt / estimate(large.d, large.brief, large.porch).perSqFt).toFixed(2) + "x",
  style: (100 * (estimate(farm.d, farm.brief, farm.porch).perSqFt / estimate(mini.d, mini.brief, mini.porch).perSqFt - 1)).toFixed(1) + "%",
  porch: "$" + Math.round(farm.porch * (428215 / 2647) * ASSUMPTIONS.porchShare).toLocaleString("en-US"),
  crawl: (100 * (estimate(crawl.d, crawl.brief, crawl.porch).total / estimate(farm.d, farm.brief, farm.porch).total - 1)).toFixed(1) + "%",
  garage: (100 * (estimate(garage.d, garage.brief, garage.porch).total / estimate(farm.d, farm.brief, farm.porch).total - 1)).toFixed(1) + "%",
  layout: (() => { const psf = skelDrivers.map((x) => estimate(x.d, b3, x.porch).perSqFt).sort((p, q) => p - q); return (100 * (psf[psf.length - 1] / psf[0] - 1)).toFixed(1) + "%"; })(),
};
console.log("Cost findings under 500 draws of the cost model's assumptions (seed 20261021)");
console.log(`${"finding".padEnd(60)} ${"as built".padEnd(9)} ${"5th".padStart(9)} ${"median".padStart(9)} ${"95th".padStart(9)}`);
console.log(line("$/sq ft, 1,000 vs 2,200 sq ft asked (3 bed, minimal)", rows.size, "x", base.size));
console.log(line("farmhouse over minimal, $/sq ft (3 bed, 1,400)", rows.style, "%", base.style));
console.log(line("full-width porch on the farmhouse", rows.porch, "$", base.porch));
console.log(line("crawlspace over slab (farmhouse)", rows.crawl, "%", base.crawl));
console.log(line("two-car garage (farmhouse)", rows.garage, "%", base.garage));
console.log(line(`widest $/sq ft spread, ${skelDrivers.length} rule-passing 3-bed layouts*`, rows.layout, "%", base.layout));
console.log("* dearest against cheapest; their areas differ by up to 17% (the search accepts -7% to +10% of the asked area)");
