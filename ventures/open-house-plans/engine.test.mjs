import { test } from "node:test";
import assert from "node:assert/strict";
import { design, designFiles, parseBrief } from "./engine.mjs";
import { normalizeBrief, BATHS } from "./brief.mjs";
import { searchDesigns } from "./search.mjs";
import { STYLES } from "./styles.mjs";
import { area as polyArea, bbox, EPS } from "./geom.mjs";
import { SLEEP } from "./layout.mjs";
import { runChecks } from "./checks.mjs";
import { estimate, REFERENCE_DRIVERS, ANCHOR } from "./cost.mjs";

/** Invariants every finished plan must hold. */
function assertSound(plan, brief, label) {
  // rooms tile the rectangle (buildWalls already throws on gaps and overlaps)
  const total = plan.rooms.reduce((s, r) => s + polyArea(r.poly), 0);
  assert.ok(Math.abs(total - plan.W * plan.D) < 1e-6, `${label}: rooms cover ${total} of ${plan.W * plan.D}`);
  for (const r of plan.rooms) {
    const b = bbox(r.poly);
    assert.ok(b.x0 >= -EPS && b.y0 >= -EPS && b.x1 <= plan.W + EPS && b.y1 <= plan.D + EPS, `${label}: ${r.name} outside the footprint`);
  }
  // openings sit inside their walls and do not overlap each other
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  const byLine = new Map();
  for (const o of plan.openings) {
    const w = walls.get(o.wall);
    assert.ok(w && w.type !== "open", `${label}: ${o.kind} has no wall`);
    assert.ok(o.pos - o.width / 2 >= w.a - EPS && o.pos + o.width / 2 <= w.b + EPS, `${label}: ${o.kind} runs past its wall`);
    const key = `${w.dir}${w.c}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(o);
    if (o.kind === "window") {
      assert.ok(o.sill >= 1.5 - EPS, `${label}: window sill ${o.sill}`);
      assert.ok(o.sill + o.height <= plan.ceiling + EPS, `${label}: window head above the ceiling`);
    }
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].pos - list[i].width / 2 >= list[i - 1].pos + list[i - 1].width / 2 - EPS, `${label}: ${list[i - 1].kind} and ${list[i].kind} overlap`);
  }
  // kitchen appliances inside the kitchen and clear of each other
  const kb = bbox(plan.rooms.find((r) => r.kind === "kitchen").poly);
  const app = plan.kitchenLayout.items.filter((i) => i.kind !== "counter");
  for (const it of app) assert.ok(it.x0 >= kb.x0 - EPS && it.x1 <= kb.x1 + EPS && it.y0 >= kb.y0 - EPS && it.y1 <= kb.y1 + EPS, `${label}: ${it.kind} outside the kitchen`);
  for (let i = 0; i < app.length; i++) for (let j = i + 1; j < app.length; j++) {
    const a = app[i], b = app[j];
    const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.01;
    assert.ok(!ov, `${label}: ${a.kind} overlaps ${b.kind}`);
  }
  // every rule check passes
  const failed = runChecks(plan, brief, STYLES[brief.style]).filter((c) => !c.pass && c.severity === "rule");
  assert.deepEqual(failed.map((c) => c.label), [], `${label}: failed checks`);
}

test("every program from a studio to five bedrooms gets a sound design", () => {
  let n = 0;
  for (const beds of [0, 1, 2, 3, 4, 5]) for (const baths of BATHS) for (const garage of [0, 1, 2]) for (const accessible of [false, true]) {
    const { brief } = normalizeBrief({ beds, baths, garage, accessible });
    if (brief.baths !== baths) continue;
    const r = searchDesigns(brief, { keep: 1 });
    const label = JSON.stringify({ beds, baths, garage, accessible });
    assert.ok(r.designs.length, `${label}: no design`);
    assertSound(r.designs[0].plan, brief, label);
    n++;
  }
  assert.ok(n >= 140, `${n} programs`);
});

test("every style and priority gives a sound three-bedroom design", () => {
  for (const style of Object.keys(STYLES)) for (const priority of ["budget", "balanced", "beauty"]) for (const foundation of ["slab", "crawl"]) {
    const { brief } = normalizeBrief({ beds: 3, style, priority, foundation });
    const r = searchDesigns(brief, { keep: 1 });
    assertSound(r.designs[0].plan, brief, `${style}/${priority}/${foundation}`);
  }
});

test("the same brief always gives the same plan set", () => {
  const a = designFiles({ beds: 3, style: "craftsman" }).files;
  const b = designFiles({ beds: 3, style: "craftsman" }).files;
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const k of Object.keys(a)) assert.equal(a[k], b[k], k);
});

test("priorities move the design: budget is cheaper per square foot than beauty", () => {
  const cheap = design({ beds: 3, priority: "budget", style: "minimal" }).design;
  const pretty = design({ beds: 3, priority: "beauty", style: "minimal" }).design;
  assert.ok(cheap.cost.perSqFt <= pretty.cost.perSqFt, `${cheap.cost.perSqFt} vs ${pretty.cost.perSqFt}`);
});

test("a lot width is respected, and an impossible lot says why", () => {
  const ok = design({ beds: 3, lot: { width: 70, depth: 140 } });
  assert.ok(ok.design.footprint.width <= 60);
  const bad = design({ beds: 4, garage: 2, lot: { width: 50 } });
  assert.match(bad.error, /needs about \d+ ft/);
});

test("variants are different layouts", () => {
  const r = design({ beds: 3 });
  assert.ok(r.alternatives.length >= 2);
  const g0 = JSON.parse(designFiles({ beds: 3 }).files["design.json"]).geometry;
  const g1 = JSON.parse(designFiles({ beds: 3, variant: 1 }).files["design.json"]).geometry;
  assert.notDeepEqual(g0.rooms, g1.rooms);
});

test("plain English becomes a brief", () => {
  const cases = [
    ["3 bed 2 bath craftsman, about 1,500 sq ft, crawlspace", { beds: 3, baths: 2, style: "craftsman", area: 1500, foundation: "crawl" }],
    ["four bedroom ranch, 2.5 baths, 2-car garage, 60x120 lot", { beds: 4, baths: 2.5, style: "ranch", garage: 2, lot: { width: 60, depth: 120 } }],
    ["studio ADU, modern, 420 sq ft, budget", { beds: 0, style: "modern", area: 420, priority: "budget" }],
    ["two bedroom cottage with a porch", { beds: 2, style: "cottage", porch: true }],
    ["accessible one-level home for a wheelchair user, 2 bed", { beds: 2, accessible: true }],
    ["luxury modern farmhouse 3 bed 9 ft ceilings, no porch", { beds: 3, style: "farmhouse", finish: "premium", ceiling: 9, porch: false }],
    ["backyard ADU", { beds: 1 }],
  ];
  for (const [text, want] of cases) {
    const { brief } = parseBrief(text);
    for (const [k, v] of Object.entries(want)) assert.deepEqual(brief[k], v, `${text}: ${k}`);
  }
});

test("a text brief and explicit fields combine; DEFAULTS merged in by an agent do not override the text", () => {
  const r = design({ text: "2 bed cottage", beds: 3, style: "farmhouse", priority: "balanced" });
  assert.equal(r.brief.style, "cottage");
  assert.equal(r.brief.beds, 2);
  const r2 = design({ text: "2 bed cottage", garage: 1 });
  assert.equal(r2.brief.garage, 1);
});

test("briefs are clamped with a note for every change", () => {
  const { brief, notes } = normalizeBrief({ beds: 9, baths: 0.2, area: 100, style: "gothic", foo: 1 });
  assert.equal(brief.beds, 5);
  assert.equal(brief.baths, 1);
  assert.equal(brief.style, "farmhouse");
  assert.ok(brief.area >= 1550);
  assert.ok(notes.length >= 5, notes.join("; "));
});

test("the cost model reproduces its anchor on the reference geometry", () => {
  const r = estimate(REFERENCE_DRIVERS, { finish: "standard", foundation: "survey mix", region: 1 });
  assert.ok(Math.abs(r.total - ANCHOR.construction) < 0.01, `${r.total}`);
  const shares = Object.fromEntries(Object.entries(r.stages).map(([k, v]) => [k, v / r.total]));
  assert.ok(Math.abs(shares.framing - 0.166) < 1e-9);
});

test("design() output is small enough for an agent's tool call", () => {
  const r = design({ beds: 5, garage: 2 });
  assert.ok(JSON.stringify(r).length < 60_000);
  assert.ok(r.design.rooms.length > 10);
  assert.equal(r.license, "CC0 1.0 Universal (public domain dedication)");
});

test("the plan is single-storey and sleeping rooms have closets", () => {
  const r = searchDesigns(normalizeBrief({ beds: 4 }).brief, { keep: 1 }).designs[0].plan;
  for (const b of r.rooms.filter((x) => SLEEP.has(x.kind))) {
    assert.ok(r.rooms.some((c) => (c.kind === "closet" && c.owner === b.id) || (b.kind === "primary" && c.kind === "wic")), b.name);
  }
});
