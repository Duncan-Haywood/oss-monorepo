import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

const run = (argv, plan) => main(argv, () => (typeof plan === "string" ? plan : JSON.stringify(plan)));

test("help carries the no-warranty clause and the code disclaimer", () => {
  const { code, out } = run(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /No warranty/);
  assert.match(out, /not engineering, construction or building-code advice/);
  assert.match(out, /not checks? them against a span table|nothing here checks them against a span table/);
});

test("no arguments prints help and exits 2", () => {
  assert.equal(run([]).code, 2);
});

test("the example plan round-trips through the CLI into an order, a cut list and layout marks", () => {
  const ex = run(["--example"]);
  const { code, out } = run(["plan.json"], ex.out);
  assert.equal(code, 0);
  assert.match(out, /^8 walls, 211\.5 ft of wall/);
  assert.match(out, /ORDER/);
  assert.match(out, /precut stud/);
  assert.match(out, /CUT LIST/);
  assert.match(out, /Front \(40' 0"\): 0", 1-1\/2" C, 3" C, 15-1\/4"/);
});

test("lengths may be typed as feet and inches in a plan file", () => {
  const plan = { walls: [{ id: "A", length: "10'", openings: [{ kind: "window", offset: "3' 4\"", width: "36", height: "4'", header: "2x10" }] }] };
  const { code, out } = run(["p.json", "--json"], plan);
  assert.equal(code, 0);
  const r = JSON.parse(out);
  assert.equal(r.walls[0].length, 120);
  assert.equal(r.walls[0].members.filter((m) => m.kind === "king").length, 2);
});

test("a plan with problems exits 1 and lists them", () => {
  const plan = samplePlan();
  plan.walls[0].openings[0].offset = 0;
  const { code, out } = run(["p.json"], plan);
  assert.equal(code, 1);
  assert.match(out, /run past the end studs/);
});

test("unreadable JSON exits 2", () => {
  assert.equal(run(["p.json"], "{nope").code, 2);
});

test("--csv prints the order and cut list", () => {
  const { code, out } = run(["p.json", "--csv"], samplePlan());
  assert.equal(code, 0);
  assert.match(out, /^section,size,length_in/);
  assert.match(out, /\norder,2x4,/);
  assert.match(out, /\ncut,2x10,/);
  assert.match(out, /\nboard,2x4,/);
});

test("--sheathing adds panels and a sheet order, and skips interior walls", () => {
  const plan = JSON.stringify(samplePlan());
  const { code, out } = main(["plan.json", "--sheathing"], () => plan);
  assert.equal(code, 0);
  assert.match(out, /SHEATHING/);
  assert.match(out, /panels from \d+ sheets of 4x9/);
  assert.doesNotMatch(out, /\n  Hall: \d/);
});

test("--drawings prints one printable sheet per wall", async () => {
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const plan = samplePlan();
  const { code, out } = main(["plan.json", "--drawings"], () => JSON.stringify(plan));
  assert.equal(code, 0);
  assert.match(out, /^<!doctype html>/);
  assert.equal((out.match(/<section class="sheet">/g) || []).length, plan.walls.length);
});

test("--panel-max prints shop drawings with panels", () => {
  const r = main(["plan.json", "--panel-max=12ft"], () => JSON.stringify(samplePlan()));
  assert.equal(r.code, 0);
  assert.match(r.out, /Shop panels/);
});

test("--panel-max with --panel-order prints the pooled panel order against the whole-wall order", () => {
  const r = main(["plan.json", "--panel-max=12ft", "--panel-order"], () => JSON.stringify(samplePlan()));
  assert.equal(r.code, 0);
  assert.match(r.out, /^\d+ shop panels: \d+ boards, cost [\d.]+ \(whole walls: \d+ boards/);
});

test("--floor lays the plan's floor and orders its lumber with the walls", async () => {
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const { sampleFloor } = await import("./floor.mjs");
  const plan = { ...samplePlan(), floor: sampleFloor() };
  const { code, out } = main(["p.json", "--floor"], () => JSON.stringify(plan));
  assert.equal(code, 0);
  assert.match(out, /FLOOR/);
  assert.match(out, /Subfloor: \d+ sheets/);
  assert.match(out, /2x10/);
});

test("--floor reads a stairwell opening with feet-and-inches lengths", async () => {
  const { sampleFloor } = await import("./floor.mjs");
  const plan = { ...samplePlan(), floor: { ...sampleFloor(), openings: [{ x: "8ft 4in", y: "3ft 4in", width: "3ft", depth: "8ft 4in" }] } };
  const { code, out } = main(["p.json", "--floor"], () => JSON.stringify(plan));
  assert.equal(code, 0, out);
  assert.match(out, /1 opening \(.* clear\)/);
});

test("--roof lays a gable roof and orders rafters with the walls and floor", async () => {
  const { sampleRoof } = await import("./roof.mjs");
  const plan = { ...samplePlan(), roof: { ...sampleRoof(), width: "28ft", length: "40ft" } };
  const { code, out } = main(["p.json", "--roof"], () => JSON.stringify(plan));
  assert.equal(code, 0);
  assert.match(out, /ROOF/);
  assert.match(out, /62 2x8 rafters/);
  assert.match(out, /rafter$/m);
  assert.match(out, /Roofing: .* squares -> \d+ bundles/);
});

test("--roof without a roof object exits 2 and a too-long rafter exits 1", async () => {
  const { sampleRoof } = await import("./roof.mjs");
  assert.equal(main(["p.json", "--roof"], () => JSON.stringify(samplePlan())).code, 2);
  const r = main(["p.json"], () => JSON.stringify({ ...samplePlan(), roof: { ...sampleRoof(), pitch: 9 } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /roof has problems/);
});
