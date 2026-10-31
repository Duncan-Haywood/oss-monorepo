import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { panelizeWall } from "./panels.mjs";
import { markMembers, wallElevationSvg, partsTableHtml, drawingSetHtml } from "./drawings.mjs";

const house = () => { const plan = samplePlan(); return { plan, r: takeoff(plan) }; };

test("every member gets a mark and the parts table's quantities add up to the member count", () => {
  const { r } = house();
  for (const w of r.walls) {
    const { marks, parts } = markMembers(w);
    assert.equal(marks.length, w.members.length);
    assert.ok(marks.every(Boolean));
    assert.equal(parts.reduce((s, p) => s + p.qty, 0), w.members.length);
    assert.equal(new Set(parts.map((p) => p.mark)).size, parts.length);
  }
});

test("identical studs share a mark; different lengths do not", () => {
  const { r } = house();
  const w = r.walls[0];
  const { marks } = markMembers(w);
  const studs = w.members.map((m, i) => ({ m, mark: marks[i] })).filter((x) => x.m.kind === "stud");
  const byLen = new Map();
  for (const { m, mark } of studs) byLen.set(m.length.toFixed(3) + m.label, mark);
  const same = studs.filter((x) => x.m.length === studs[0].m.length && x.m.label === studs[0].m.label);
  assert.ok(same.every((x) => x.mark === same[0].mark));
  const marksByKey = new Map();
  for (const { m, mark } of studs) { const k = m.length.toFixed(3) + m.label; assert.equal(marksByKey.get(k) ?? mark, mark); marksByKey.set(k, mark); }
  assert.equal(new Set(marksByKey.values()).size, marksByKey.size);
});

test("the parts quantities across walls match the engine's cut list", () => {
  const { r } = house();
  let drawn = 0;
  for (const w of r.walls) drawn += markMembers(w).parts.reduce((s, p) => s + p.qty, 0);
  assert.equal(drawn, r.walls.reduce((s, w) => s + w.members.length, 0));
});

test("the elevation is a well-formed SVG with an overall dimension and opening labels", () => {
  const { plan, r } = house();
  const svg = wallElevationSvg(r.walls[0], plan.walls[0], plan);
  assert.match(svg, /^<svg [^>]*viewBox="/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /overall/);
  for (const o of plan.walls[0].openings) assert.ok(svg.includes(o.label), o.label);
  assert.equal((svg.match(/<rect/g) || []).length >= r.walls[0].members.length, true);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test("labels are escaped", () => {
  const plan = samplePlan();
  plan.walls[0].id = 'A<b>"&';
  plan.walls[0].openings[0].label = "<script>x</script>";
  const r = takeoff(plan);
  const html = drawingSetHtml(r, plan);
  assert.doesNotMatch(html, /<script>x/);
  assert.doesNotMatch(html, /A<b>/);
});

test("a gable wall draws sloped plates as polygons, no NaN", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "G", length: 240, stud: "2x4", gable: { pitch: 6, peak: 90 }, openings: [] }];
  const r = takeoff(plan);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const svg = wallElevationSvg(r.walls[0], plan.walls[0], plan);
  assert.match(svg, /<polygon/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test("the drawing set has one sheet per wall, the disclaimer on each, and a clean layout check", () => {
  const { plan, r } = house();
  const html = drawingSetHtml(r, plan);
  assert.equal((html.match(/<section class="sheet">/g) || []).length, plan.walls.length);
  assert.equal((html.match(/No warranty\./g) || []).length, plan.walls.length);
  assert.match(html, /Layout check passed/);
  assert.doesNotMatch(html, /fetch\(|<script/);
  assert.match(partsTableHtml(r.walls[0]), /<th>Mark<\/th>/);
});

test("panelMax adds purple panel joints, a panel table and keeps the layout check", () => {
  const { plan, r } = house();
  const html = drawingSetHtml(r, plan, { panelMax: 144 });
  assert.match(html, /Shop panels \(up to 12&#39;/);
  assert.match(html, /Panel A/);
  assert.match(html, /stroke="#6a2c91"/);
  assert.match(html, /Lumber weight/);
  assert.match(html, /Panel A cut list/);
  assert.match(html, /\d+(\.\d)? lb/);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.doesNotMatch(drawingSetHtml(r, plan), /Shop panels/);
});

test("sheathing weight adds Sheathing and Total columns to the panel table only when asked", async () => {
  const { takeoff, samplePlan } = await import("./engine.mjs");
  const plan = samplePlan(), r = takeoff(plan);
  const plain = drawingSetHtml(r, plan, { panelMax: 144 });
  const heavy = drawingSetHtml(r, plan, { panelMax: 144, sheathPsf: 1.5 });
  assert.ok(!plain.includes("<th class=\"n\">Sheathing</th>"));
  assert.ok(heavy.includes("<th class=\"n\">Sheathing</th>") && heavy.includes("1.5 lb per sq ft"));
});

test("panelSheets adds one cropped sheet per panel with its own cut list", () => {
  const { plan, r } = house();
  const plain = drawingSetHtml(r, plan, { panelMax: 144 });
  const html = drawingSetHtml(r, plan, { panelMax: 144, panelSheets: true });
  const nPanels = r.walls.reduce((s, w) => s + panelizeWall(w, 144).panels.length, 0);
  const sheets = (h) => (h.match(/<section class="sheet">/g) || []).length;
  assert.equal(sheets(html), sheets(plain) + nPanels);
  assert.match(html, /Shop drawing of panel A of wall /);
  assert.match(html, /<h1>[^<]* panel A<\/h1>/);
  assert.equal(sheets(drawingSetHtml(r, plan, { panelSheets: true })), r.walls.length, "ignored without panelMax");
});

test("sheathing sheet marks are outlined on the wall elevation when a sheathing result is given", async () => {
  const { sheathe } = await import("./sheathing.mjs");
  const { plan, r } = house();
  const sh = sheathe(plan, r);
  assert.ok(sh.ok);
  const sw = sh.walls.find((x) => Number.isFinite(x.panels[0]?.y0));
  const w = r.walls.find((x) => x.id === sw.id);
  const wall = plan.walls.find((x) => x.id === sw.id);
  const withSheets = wallElevationSvg(w, wall, plan, null, sw);
  assert.equal((withSheets.match(/stroke="#2e7d32"/g) || []).length, sw.panels.length);
  for (const p of sw.panels) assert.ok(withSheets.includes(`>${p.id}</text>`));
  assert.ok(!wallElevationSvg(w, wall, plan).includes("#2e7d32\""));
  r.sheathing = sh;
  assert.ok(drawingSetHtml(r, plan, {}).includes(`>${sw.panels[0].id}</text>`));
});
