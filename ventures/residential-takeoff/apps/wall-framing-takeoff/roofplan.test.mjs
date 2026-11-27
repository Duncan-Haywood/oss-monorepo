import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineRoof } from "./roofoutline.mjs";
import { frameOutlineRoof } from "./hipframe.mjs";
import { roofPlan, roofPlanSvg, roofPlanLegend, eaveDimensions, ROOF_PLAN_STYLE } from "./roofplan.mjs";
import { cleanDrawing, bidPackageHtml } from "./bidpackage.mjs";
import { proposal } from "./bidletter.mjs";

const stock = ["2x8", "2x10", "2x12"].flatMap((size) => [96, 120, 144, 168, 192, 240, 288].map((length) => ({ size, length, price: length / 12 })));
const L = [[0, 0], [480, 0], [480, 240], [240, 240], [240, 420], [0, 420]];

function build(pts, pitch = 6, o = {}) {
  const ro = outlineRoof(pts, { pitch, overhang: o.overhang ?? 12 });
  assert.equal(ro.ok, true);
  const f = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch, spacing: 16, rafter: "2x8", hip: "2x10", ridge: "2x10", stock });
  return { ro, f };
}

test("a rectangle draws one ridge and four hips, with every rafter the framing made", () => {
  const { ro, f } = build([[0, 0], [480, 0], [480, 336], [0, 336]], 4);
  assert.equal(f.ok, true, f.ok ? "" : f.errors.join(" "));
  const p = roofPlan(ro, f);
  assert.equal(p.ok, true);
  assert.equal(p.counts.ridge, 1);
  assert.equal(p.counts.hip, 4);
  assert.equal(p.counts.valley, undefined);
  assert.equal(p.rafters.length, f.rafters.length);
  const svg = roofPlanSvg(p);
  assert.equal((svg.match(/<line /g) || []).length, f.rafters.length + ro.lines.length);
  assert.equal((svg.match(/data-kind="hip"/g) || []).length, 4);
  // the eave line is the outline moved out 12 in: a 504 x 360 in box
  assert.match(svg, /points="0,360 504,360 504,0 0,0"/);
});

test("an L draws its valley, and every drawn point lies inside the eave line's box", () => {
  const { ro, f } = build(L);
  assert.equal(f.ok, true, f.ok ? "" : f.errors.join(" "));
  const p = roofPlan(ro, f);
  assert.equal(p.counts.valley, 1);
  assert.ok(p.counts.ridge >= 1);
  for (const s of [...p.lines, ...p.rafters]) for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y1]]) {
    assert.ok(x >= p.box.x0 - 1e-6 && x <= p.box.x1 + 1e-6 && y >= p.box.y0 - 1e-6 && y <= p.box.y1 + 1e-6, `${s.kind} at ${x}, ${y}`);
  }
  // SVG y is flipped: the plan's top edge (y = 432, the eave of the 420 in wall) is drawn at 0
  const svg = roofPlanSvg(p);
  const ys = [...svg.matchAll(/y[12]="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= p.box.y1 - p.box.y0 + 1e-6);
  const legend = roofPlanLegend(p);
  assert.deepEqual(legend.map((r) => r.kind), Object.keys(ROOF_PLAN_STYLE).filter((k) => p.counts[k]));
  assert.equal(legend.reduce((t, r) => t + r.count, 0), p.lines.length + p.rafters.length);
});

test("an outline that does not frame still draws its roof lines, with no rafters", () => {
  const ro = outlineRoof(L, { pitch: 6 });
  const f = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch: 6, spacing: 16, rafter: "2x8", stock: stock.filter((s) => s.length <= 192) });
  assert.equal(f.ok, false);
  const p = roofPlan(ro, f);
  assert.equal(p.rafters.length, 0);
  assert.equal((roofPlanSvg(p).match(/<line /g) || []).length, ro.lines.length);
  assert.doesNotMatch(roofPlanSvg(p), /rafters;/);
});

test("nothing to draw gives no SVG, and only numbers and fixed words reach it", () => {
  assert.equal(roofPlan(null).ok, false);
  assert.equal(roofPlanSvg(roofPlan({ ok: false })), "");
  assert.deepEqual(roofPlanLegend(roofPlan(null)), []);
  const { ro, f } = build(L);
  const svg = roofPlanSvg(roofPlan(ro, f));
  for (const m of svg.matchAll(/data-kind="([^"]*)"/g)) assert.ok(["eave", "walls", "dim", ...Object.keys(ROOF_PLAN_STYLE)].includes(m[1]), m[1]);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  // the only text is the dimension labels: feet, inches and fractions
  for (const m of svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)) assert.match(m[1], /^(\d+' )?(\d+-)?\d+(\/\d+)?"$/, m[1]);
});

test("every eave side is dimensioned with its length along the eave edge (hand-checked on the L)", () => {
  const { ro, f } = build(L);
  const p = roofPlan(ro, f);
  const d = eaveDimensions(p);
  assert.equal(d.length, 6);
  // the L's walls are 480, 240, 240, 180, 240 and 420 in; a 12 in eave adds 24 at an outside-outside side,
  // and nothing where one end is an inside corner and the other an outside one
  assert.deepEqual(d.map((x) => x.length), [504, 264, 240, 180, 264, 444]);
  assert.deepEqual(d.map((x) => x.label), [`42' 0"`, `22' 0"`, `20' 0"`, `15' 0"`, `22' 0"`, `37' 0"`]);
  // dimension lines sit outside the eave line: the outward normal of side 1 (along +x at the bottom) is -y
  assert.deepEqual([d[0].nx, d[0].ny], [0, -1]);
  const svg = roofPlanSvg(p);
  assert.equal((svg.match(/<text /g) || []).length, 6);
  assert.equal((svg.match(/<path [^>]*data-kind="dim"/g) || []).length, 6);
  assert.match(svg, />42' 0"<\/text>/);
  // vertical sides' labels are turned to read along the side
  assert.equal((svg.match(/rotate\(-90 /g) || []).length, 3);
  // the margin grows to hold them, and dimensions can be left off
  const plain = roofPlanSvg(p, { dimensions: false });
  assert.doesNotMatch(plain, /<text |data-kind="dim"/);
  const vb = (s) => s.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  assert.ok(vb(svg)[0] < vb(plain)[0] && vb(svg)[2] > vb(plain)[2]);
});

test("the bid package prints the roof plan, and drops a drawing that could run anything", () => {
  const { ro, f } = build(L);
  const svg = roofPlanSvg(roofPlan(ro, f));
  assert.equal(cleanDrawing(svg), svg);
  for (const bad of [
    svg.replace("</svg>", "<script>alert(1)</script></svg>"),
    svg.replace("<polygon ", "<polygon onload=\"alert(1)\" "),
    svg.replace("</svg>", "<image href=\"https://example.com/x.png\"/></svg>"),
    svg.replace("</svg>", "<foreignObject><div></div></foreignObject></svg>"),
    svg.replace('style="', 'style="background:url(https://example.com/x);'),
    "<div>" + svg + "</div>", 42, null,
  ]) assert.equal(cleanDrawing(bad), "", String(bad).slice(0, 60));
  const b = {
    lines: [{ section: "Roof", item: "Roof sheathing sheets", qty: 54, unit: "sheets", unitPrice: 30, amount: 1620 }],
    sections: [{ name: "Roof", subtotal: 1620, unpriced: 0 }], materials: 1620, tax: 0, contingency: 0, total: 1620, bid: 1620, unpriced: [],
  };
  const q = proposal(b, { client: "A client", project: "Roof" });
  assert.ok(q.ok, JSON.stringify(q));
  const withPlan = bidPackageHtml(q, b, { company: "Framing Co" }, { roofPlanSvg: svg });
  assert.match(withPlan, /<h2>Roof plan<\/h2>/);
  assert.ok(withPlan.includes(svg));
  assert.ok(withPlan.indexOf("Roof plan") < withPlan.indexOf("Quantities from the plans"));
  const without = bidPackageHtml(q, b, { company: "Framing Co" });
  assert.doesNotMatch(without, /Roof plan/);
  assert.doesNotMatch(bidPackageHtml(q, b, {}, { roofPlanSvg: "<svg><script>x</script></svg>" }), /script>x/);
});
