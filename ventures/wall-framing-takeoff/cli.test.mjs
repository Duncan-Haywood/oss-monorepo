import { sampleRoof } from "./roof.mjs";
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

test("--insulation counts bags from the framing placed in the example plan", () => {
  const ex = run(["--example"]);
  const { code, out } = run(["plan.json", "--insulation"], ex.out);
  assert.equal(code, 0);
  assert.match(out, /INSULATION\n  \d+ bags at 88 sq ft/);
  assert.match(out, /2x4 cavities: \d+ sq ft, R-15/);
  assert.equal(run(["plan.json", "--insulation"], { ...JSON.parse(ex.out), insulation: { waste: 0.9 } }).code, 1);
});

test("a DXF floor plan goes straight to a takeoff, or to plan JSON with --plan-only", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const L = (l, a, b, c, d) => g(0, "LINE") + g(8, l) + g(10, a) + g(20, b) + g(11, c) + g(21, d);
  const dxf = g(0, "SECTION") + g(2, "ENTITIES") + L("WALL", 0, 0, 480, 0) + L("WALL", 480, 0, 480, 336) + L("WALL", 480, 336, 0, 336) + L("WALL", 0, 336, 0, 0) + g(0, "ENDSEC");
  const t = run(["house.dxf"], dxf);
  assert.equal(t.code, 0);
  assert.match(t.out, /Read 4 walls \(4 exterior, 0 interior\)/);
  assert.match(t.out, /ORDER/);
  const j = run(["house.dxf", "--plan-only"], dxf);
  assert.equal(JSON.parse(j.out.split("\n\nNotes")[0]).walls.length, 4);
  assert.equal(run(["house.dxf"], g(0, "EOF")).code, 2);
});

test("--wall-layer reads a drawing whose layers are not named like wall", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const L = (l, a, b, c, d) => g(0, "LINE") + g(8, l) + g(10, a) + g(20, b) + g(11, c) + g(21, d);
  const dxf = g(0, "SECTION") + g(2, "ENTITIES") + L("PLAN-X", 0, 0, 480, 0) + L("PLAN-X", 480, 0, 480, 336) + L("PLAN-X", 480, 336, 0, 336) + L("PLAN-X", 0, 336, 0, 0) + g(0, "ENDSEC");
  const bad = run(["house.dxf", "--plan-only"], dxf);
  assert.equal(bad.code, 2);
  assert.match(bad.out, /Layers with lines: PLAN-X/);
  const ok = run(["house.dxf", "--plan-only", "--wall-layer=plan-x"], dxf);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(JSON.parse(ok.out.split("\n\nNotes")[0]).walls.length, 4);
});

test("an IFC floor plan goes through the same route as a DXF", () => {
  const w = (n, x, y, rx, ry, len) => `#${n}0=IFCCARTESIANPOINT((${x},${y},0.));\n#${n}1=IFCDIRECTION((${rx},${ry},0.));\n#${n}2=IFCAXIS2PLACEMENT3D(#${n}0,$,#${n}1);\n#${n}3=IFCLOCALPLACEMENT($,#${n}2);\n#${n}4=IFCCARTESIANPOINT((0.,0.));\n#${n}5=IFCCARTESIANPOINT((${len},0.));\n#${n}6=IFCPOLYLINE((#${n}4,#${n}5));\n#${n}7=IFCSHAPEREPRESENTATION(#1,'Axis','Curve2D',(#${n}6));\n#${n}8=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n}7));\n#${n}9=IFCWALLSTANDARDCASE('g',#2,'W',$,$,#${n}3,#${n}8,$,.STANDARD.);\n`;
  const ifc = "ISO-10303-21;\nDATA;\n#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\n" + w(10, 0, 0, 1, 0, 8) + w(11, 8, 0, 0, 1, 5) + w(12, 8, 5, -1, 0, 8) + w(13, 0, 5, 0, -1, 5) + "ENDSEC;\nEND-ISO-10303-21;\n";
  const t = run(["house.ifc"], ifc);
  assert.equal(t.code, 0, t.out);
  assert.match(t.out, /Read 4 walls \(4 exterior, 0 interior\)/);
  assert.equal(run(["house.ifc"], "not ifc").code, 2);
});

test("--fasteners counts nails; with --sheathing it adds the sheathing nails", () => {
  const ex = run(["--example"]);
  const a = run(["plan.json", "--fasteners"], ex.out), b = run(["plan.json", "--fasteners", "--sheathing"], ex.out);
  assert.equal(a.code, 0);
  assert.match(a.out, /FASTENERS\n  \d+ nails counted/);
  assert.match(a.out, /Sheathing nails are left out/);
  assert.match(b.out, /Sheathing nails \(/);
  assert.equal(run(["plan.json", "--fasteners"], { ...JSON.parse(ex.out), fasteners: { waste: 2 } }).code, 1);
});

test("--budget --csv prints the priced lines as CSV with totals", () => {
  const plan = { ...samplePlan(), prices: { laborWallFoot: 12, tax: 0.07 } };
  const { code, out } = run(["plan.json", "--budget", "--csv"], plan);
  assert.equal(code, 0);
  const rows = out.split("\n");
  assert.equal(rows[0], "section,item,qty,unit,unit_price,amount,source");
  assert.ok(rows.some((l) => l.startsWith("Labor,Wall framing,")));
  assert.match(rows.at(-1), /^,Total,/);
});

test("--trim adds baseboard and casing boards, kept with --sheathing and in the budget", () => {
  const plan = JSON.stringify({ ...samplePlan(), prices: { baseboard: 12, casing: 9 } });
  const read = () => plan;
  const a = main(["plan.json", "--trim", "--sheathing"], read);
  assert.equal(a.code, 0);
  assert.match(a.out, /TRIM\n  Baseboard: \d+ ft/);
  assert.match(a.out, /Casing: \d+ ft for \d+ door faces/);
  const b = main(["plan.json", "--trim", "--budget"], read);
  assert.match(b.out, /Baseboard boards/);
  assert.equal(main(["plan.json"], read).out.includes("TRIM"), false);
});

test("--siding adds courses, house wrap and corner boards, kept with --sheathing and in the budget", () => {
  const plan = JSON.stringify({ ...samplePlan(), prices: { sidingBoard: 14, houseWrapRoll: 150, cornerBoard: 20 } });
  const read = () => plan;
  const a = main(["plan.json", "--siding", "--sheathing"], read);
  assert.equal(a.code, 0);
  assert.match(a.out, /SIDING\n  Siding: \d+ exterior wall\(s\)/);
  assert.match(a.out, /House wrap: \d+ sq ft/);
  const b = main(["plan.json", "--siding", "--budget"], read);
  assert.match(b.out, /Siding boards/);
  assert.match(b.out, /House wrap rolls/);
  assert.equal(main(["plan.json"], read).out.includes("SIDING"), false);
  assert.equal(main(["plan.json"], () => JSON.stringify({ ...samplePlan(), siding: { exposure: 1 } })).code, 1);
});

test("--eaves counts soffit, fascia and J-channel from the roof, and needs a roof", () => {
  const plan = { ...samplePlan(), roof: sampleRoof(), prices: { fasciaBoard: 25 } };
  const a = main(["plan.json", "--eaves", "--budget"], () => JSON.stringify(plan));
  assert.equal(a.code, 0);
  assert.match(a.out, /SOFFIT AND FASCIA\n  Soffit: \d+ sq ft under 84 ft of eave/);
  assert.match(a.out, /Fascia boards/);
  assert.equal(main(["plan.json"], () => JSON.stringify(plan)).out.includes("SOFFIT"), false);
  assert.equal(main(["plan.json", "--eaves"], () => JSON.stringify(samplePlan())).code, 1);
});

test("--gutters counts gutter, downspouts and fittings from the roof, and needs a roof", () => {
  const plan = { ...samplePlan(), roof: sampleRoof(), prices: { gutterSection: 12 } };
  const a = main(["plan.json", "--gutters", "--budget"], () => JSON.stringify(plan));
  assert.equal(a.code, 0);
  assert.match(a.out, /GUTTERS AND DOWNSPOUTS\n  Gutter: 84 ft in 2 run/);
  assert.match(a.out, /Gutter sections/);
  assert.equal(main(["plan.json"], () => JSON.stringify(plan)).out.includes("GUTTERS"), false);
  assert.equal(main(["plan.json", "--gutters"], () => JSON.stringify(samplePlan())).code, 1);
});

test("--stairs prints the stair layout and pools its lumber", () => {
  const plan = { ...samplePlan(), stairs: { totalRise: "9ft", tread: 10, openingLength: "10ft" } };
  const r = run(["p.json", "--stairs", "--json"], plan);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.stairs[0].risers, 14);
  assert.ok(j.cuts.some((c) => c.kind === "stair stringer" && c.qty === 4));
  assert.match(run(["p.json", "--stairs"], plan).out, /STAIRS/);
});

test("--deck adds the deck report with its own lumber order", async () => {
  const { sampleDeck } = await import("./deck.mjs");
  const plan = { ...samplePlan(), deck: sampleDeck() };
  const { code, out } = main(["p.json", "--deck"], () => JSON.stringify(plan));
  assert.equal(code, 0);
  assert.match(out, /DECK/);
  assert.match(out, /x 2x8 PT/);
  const bad = main(["p.json", "--deck"], () => JSON.stringify({ ...samplePlan(), deck: { ...sampleDeck(), height: 12 } }));
  assert.equal(bad.code, 1);
});
