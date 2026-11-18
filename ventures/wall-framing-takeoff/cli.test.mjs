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

test("--stack takes a drawing as a floor, as the first file does, and a missing file stops it", () => {
  const g = (c, v) => `${c}\n${v}\n`;
  const L = (l, a, b, c, d) => g(0, "LINE") + g(8, l) + g(10, a) + g(20, b) + g(11, c) + g(21, d);
  const box = (w, d) => g(0, "SECTION") + g(2, "ENTITIES") + L("WALL", 0, 0, w, 0) + L("WALL", w, 0, w, d) + L("WALL", w, d, 0, d) + L("WALL", 0, d, 0, 0) + g(0, "ENDSEC");
  const files = { "a.dxf": box(480, 336), "b.dxf": box(360, 240) };
  const rd = (p) => { if (!(p in files)) throw new Error(`no file ${p}`); return files[p]; };
  const r = main(["a.dxf", "--stack=b.dxf"], rd);
  assert.equal(r.code, 0);
  assert.match(r.out, /Stacked 2 floors into one order \(a: 4 walls, b: 4 walls\)/);
  assert.match(r.out, /8 walls/);
  assert.equal(main(["a.dxf", "--stack=missing.dxf"], rd).code, 2);
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

test("--openings prints the door and window schedule and nothing without the flag", () => {
  const read = () => JSON.stringify(samplePlan());
  const a = main(["plan.json", "--openings"], read);
  assert.equal(a.code, 0);
  assert.match(a.out, /DOOR AND WINDOW SCHEDULE\n  \d+ door\(s\) and \d+ window\(s\) in \d+ mark\(s\)/);
  assert.match(a.out, /\bD1 {2}x\d/);
  assert.equal(main(["plan.json"], read).out.includes("DOOR AND WINDOW SCHEDULE"), false);
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

test("--stairs with a null or non-object entry says so instead of crashing", () => {
  for (const bad of [[null], [5], ["x"], [[]], null]) {
    const r = run(["p.json", "--stairs"], { ...samplePlan(), stairs: bad });
    assert.equal(r.code, bad === null ? 2 : 1);
    assert.doesNotMatch(r.out, /TypeError|undefined/);
  }
});

test("--floor without a joist size names the missing field", () => {
  const r = run(["p.json", "--floor"], { ...samplePlan(), floor: { width: 240, depth: 240 } });
  assert.equal(r.code, 1);
  assert.match(r.out, /joist size is missing/);
  assert.doesNotMatch(r.out, /undefined/);
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

test("deck.stairs adds a stair whose total rise is the deck height", async () => {
  const { sampleDeck } = await import("./deck.mjs");
  const plan = { ...samplePlan(), deck: { ...sampleDeck(), height: 36, stairs: { width: 48 } } };
  const r = main(["p.json", "--deck", "--json"], () => JSON.stringify(plan));
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.stairs.length, 1);
  assert.equal(j.stairs[0].id, "Deck stair");
  assert.equal(j.stairs[0].risers, 5); // 36 / 7.75 = 4.65, so 5 equal risers of 7.2 in
  assert.ok(Math.abs(j.stairs[0].riser - 7.2) < 1e-9);
  assert.match(main(["p.json", "--deck"], () => JSON.stringify(plan)).out, /STAIRS/);
});

test("headerCheck.stairFrom takes the stairwell header's point load from the stair's stringerCheck", () => {
  const { out: ex } = run(["--example"]);
  const base = JSON.parse(ex);
  const sc = { liveLoad: 40, deadLoad: 10, Fb: 875, Fv: 135, E: 1300000 };
  const mk = (from) => ({ ...base, floor: { width: 480, depth: 336, beam: 168, joist: "2x10", spacing: 16, openings: [{ x: 100, y: 30, width: 36, depth: 100 }], headerCheck: { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000, stairSide: "front", ...(from == null ? {} : { stairFrom: from }) } }, stairs: [{ totalRise: 105, tread: 10, stringer: "2x12", width: 36, stringerCheck: sc }] });
  const withLink = run(["p.json", "--json"], mk(0));
  const without = run(["p.json", "--json"], mk(null));
  assert.equal(withLink.code, 0, withLink.out);
  const f = (o) => JSON.parse(o.out).floor.headerChecks.find((r) => r.side === "front");
  assert.ok(f(withLink).fb > f(without).fb, "the stair's load raises the front header's bending stress");
  const bad = run(["p.json", "--json"], mk(3));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /stairFrom 3/);
});

test("plan.dormer with shape shed lays a shed dormer", () => {
  const plan = { ...samplePlan(), roof: { ...sampleRoof(), width: "20ft", length: "40ft", pitch: 8, rafter: "2x12" }, dormer: { shape: "shed", width: 144, eaveHeight: 48, pitch: 3 } };
  const { code, out } = main(["p.json", "--dormer"], () => JSON.stringify(plan));
  assert.equal(code, 0, out);
  assert.match(out, /shed dormer: rafters/);
  assert.match(out, /shed rafter/);
});

test("--proposal prints a customer letter from the priced budget and refuses while a line is unpriced", () => {
  const plan = { ...samplePlan(), prices: { laborWallFoot: 4, laborOpening: 85, overhead: 0.1, profit: 0.1 }, proposal: { client: "A. Owner", exclusions: ["landscaping"] } };
  const ok = run(["plan.json", "--proposal"], plan);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /Prepared for A\. Owner/);
  assert.match(ok.out, /Not included: landscaping/);
  assert.doesNotMatch(ok.out, /profit|overhead/i);
  const gap = run(["plan.json", "--sheathing", "--proposal"], plan); // wall sheets have no typed price
  assert.equal(gap.code, 1);
  assert.match(gap.out, /Proposal not issued/);
  const part = run(["plan.json", "--sheathing", "--proposal"], { ...plan, proposal: { partial: true } });
  assert.equal(part.code, 0);
  assert.match(part.out, /WARNING: partial proposal/);
});

test("a mistyped --rim-lap, --panel-max or --sheathing-psf is refused, not ignored", () => {
  const ex = run(["--example"]).out;
  for (const bad of ["--rim-lap=zzz", "--rim-lap=-3", "--panel-max=zzz", "--sheathing-psf=abc", "--sheathing-psf=-2"]) {
    const r = run(["plan.json", bad], ex);
    assert.equal(r.code, 1, bad);
    assert.match(r.out, /is not a /, bad);
  }
  assert.equal(run(["plan.json", "--panel-max=12ft", "--panel-order"], ex).code, 0);
  assert.equal(run(["plan.json", "--sheathing", "--panel-max=12ft", "--sheathing-psf=2.5", "--rim-lap=9.25in"], ex).code, 0);
});

test("--panel-max under 6 in or over 100 ft is refused with a reason", () => {
  for (const v of ["0.5in", "2in", "200ft"]) {
    const r = main(["plan.json", `--panel-max=${v}`, "--panel-order"], () => JSON.stringify(samplePlan()));
    assert.equal(r.code, 1, v);
    assert.match(r.out, /longest panel must be 6 to 1200 in/);
  }
  assert.equal(main(["plan.json", "--panel-max=12ft"], () => JSON.stringify(samplePlan())).code, 0);
});

test("--electrical adds receptacle and switch boxes; a bad setting is refused; --json carries it", () => {
  const plan = JSON.stringify({ ...samplePlan(), electrical: { cablePerDevice: 10 } });
  const a = main(["plan.json", "--electrical"], () => plan);
  assert.equal(a.code, 0);
  assert.match(a.out, /ELECTRICAL ROUGH-IN\n  \d+ receptacle boxes/);
  const bad = main(["plan.json", "--electrical"], () => JSON.stringify({ ...samplePlan(), electrical: { maxSpacing: 3 } }));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /maxSpacing/);
  const j = main(["plan.json", "--electrical", "--json"], () => plan);
  assert.ok(JSON.parse(j.out).electrical.boxes > 0);
});

test("--drilling checks runs against stud limits; a bad run is refused; --json carries it", () => {
  const id = JSON.parse(JSON.stringify(samplePlan())).walls[0].id;
  const plan = JSON.stringify({ ...samplePlan(), drilling: { runs: [{ wall: id, kind: "bore", pipe: "3", label: "stack" }] } });
  const a = main(["plan.json", "--drilling"], () => plan);
  assert.equal(a.code, 0);
  assert.match(a.out, /STUD DRILLING AND NOTCHING\n  1 runs checked, 1 over the limit/);
  const bad = main(["plan.json", "--drilling"], () => JSON.stringify({ ...samplePlan(), drilling: { runs: [{ wall: "nope", kind: "bore", size: 1 }] } }));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /not a wall/);
  assert.equal(JSON.parse(main(["plan.json", "--drilling", "--json"], () => plan).out).drilling.failing, 1);
});

test("--paint adds interior paint gallons", () => {
  const plan = samplePlan();
  plan.paint = { ceilings: [{ width: 240, depth: 240 }], primerCoats: 1 };
  const { code, out } = run(["p.json", "--paint"], plan);
  assert.equal(code, 0);
  assert.match(out, /PAINT/);
  assert.match(out, /Primer:/);
});

test("--paint with bad settings exits 1", () => {
  const plan = samplePlan();
  plan.paint = { coats: 9 };
  const { code, out } = run(["p.json", "--paint"], plan);
  assert.equal(code, 1);
  assert.match(out, /paint has problems/);
});

test("--paint with --trim takes the trim's lineal feet; a typed trimFeet wins", () => {
  const plan = samplePlan();
  const a = JSON.parse(run(["p.json", "--paint", "--trim", "--json"], plan).out);
  const t = a.trim, feet = t.baseFeet + t.casingFeet + t.shoeFeet;
  assert.ok(feet > 0);
  assert.equal(a.paint.trimFeet, feet);
  const without = JSON.parse(run(["p.json", "--paint", "--json"], plan).out);
  assert.ok(a.paint.paintGallonsExact > without.paint.paintGallonsExact);
  plan.paint = { trimFeet: 10 };
  const b = JSON.parse(run(["p.json", "--paint", "--trim", "--json"], plan).out);
  assert.equal(b.paint.trimFeet, 10);
});

test("--flooring adds finish flooring orders", () => {
  const plan = samplePlan();
  plan.flooring = { rooms: [{ name: "den", width: 144, depth: 168, kind: "carpet" }, { name: "hall", width: 120, depth: 48, kind: "plank" }] };
  const { code, out } = run(["p.json", "--flooring"], plan);
  assert.equal(code, 0);
  assert.match(out, /FLOORING/);
  assert.match(out, /Carpet:/);
  const bad = run(["p.json", "--flooring"], { ...samplePlan(), flooring: { rooms: [] } });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /flooring has problems/);
});

test("--orders prints order-by dates and flags late items against a given day", () => {
  const plan = { ...samplePlan(), schedule: { start: "2026-03-02", activities: [{ id: "a", name: "Slab", days: 3 }, { id: "b", name: "Framing", days: 5, after: ["a"] }], orders: [{ item: "Trusses", for: "b", leadDays: 28 }] } };
  const ok = run(["plan.json", "--orders=2026-03-01"], plan);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /Trusses.*LATE by/);
  assert.match(run(["plan.json", "--orders", "--csv"], plan).out, /^order_by,item/);
  const bad = run(["plan.json", "--orders"], { ...plan, schedule: { ...plan.schedule, orders: undefined } });
  assert.equal(bad.code, 1);
  // the schedule's own reason is shown, not only "has problems"
  const none = run(["plan.json", "--orders"], samplePlan());
  assert.equal(none.code, 1);
  assert.match(none.out, /must be an object with `activities`/);
  const neg = run(["plan.json", "--orders"], { ...plan, schedule: { ...plan.schedule, activities: [{ id: "a", name: "Slab", days: -1 }] } });
  assert.match(neg.out, /a: days must be zero or more/);
});

test("--json: a refusal prints {ok:false, errors} on stdout, keeps the exit code and the text on stderr", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "wft-"));
  const ex = spawnSync("node", [fileURLToPath(new URL("./cli.mjs", import.meta.url)), "--example"], { encoding: "utf8" });
  writeFileSync(join(dir, "p.json"), ex.stdout);
  const r = spawnSync("node", [fileURLToPath(new URL("./cli.mjs", import.meta.url)), join(dir, "p.json"), "--roof", "--json"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.code, 2);
  assert.ok(j.errors[0].includes("no `roof` object"));
  assert.ok(r.stderr.includes("no `roof` object"));
  const good = spawnSync("node", [fileURLToPath(new URL("./cli.mjs", import.meta.url)), join(dir, "p.json"), "--json"], { encoding: "utf8" });
  assert.equal(good.status, 0);
  assert.ok(JSON.parse(good.stdout).walls);
});

test("--add-board adds a longer board so a plate longer than 16 ft can be ordered", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "Long", length: 300, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 40, width: 189, height: 82.5, header: "2x10" }] }];
  const read = () => JSON.stringify(plan);
  const without = main(["plan.json"], read);
  // Since 2026-11-07 the plates may splice over the header, so the 16 ft default now orders this wall too, with a note.
  assert.equal(without.code, 0, without.out);
  assert.match(without.out, /over a header/);
  const r = main(["plan.json", "--add-board=2x4:20ft"], read);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Added a 2x4 20' 0" board at 20, priced per foot/);
  assert.match(r.out, /20' 0"/);
  const priced = main(["plan.json", "--add-board=2x4:240in:31.5"], read);
  assert.match(priced.out, /Added a 2x4 20' 0" board at 31.5\./);
});

test("--add-board refuses a malformed board and an unpriced size it cannot price from", () => {
  const read = () => JSON.stringify(samplePlan());
  for (const bad of ["--add-board=2x4", "--add-board=2x4:zzz", "--add-board=2x4:20ft:abc", "--add-board=2x4:20ft:1:2", "--add-board=2x4:2000ft"]) {
    const r = main(["plan.json", bad], read);
    assert.equal(r.code, 1, bad);
    assert.match(r.out, /is not SIZE:LENGTH\[:PRICE\]/);
  }
  const r = main(["plan.json", "--add-board=4x4:12ft"], read);
  assert.equal(r.code, 1);
  assert.match(r.out, /no 4x4 on the lumber list to price from/);
});

test("--paver adds the paver takeoff from the plan's paver object", () => {
  const plan = { ...samplePlan(), paver: { areas: [{ width: 10, length: 10 }] } };
  const { code, out } = main(["p.json", "--paver"], () => JSON.stringify(plan));
  assert.equal(code, 0);
  assert.match(out, /PAVERS/);
  assert.match(out, /100\.00 sq ft/);
  const none = main(["p.json", "--paver"], () => JSON.stringify(samplePlan()));
  assert.equal(none.code, 2);
  const bad = main(["p.json", "--paver"], () => JSON.stringify({ ...samplePlan(), paver: { areas: [] } }));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /pavers have problems/i);
});

test("--skip-refused frames the good walls and lists the refused one", () => {
  const plan = samplePlan();
  plan.walls = [
    { id: "Good", length: 192, stud: "2x4", openings: [] },
    { id: "Bad", length: 120, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 0, width: 36, height: 82.5, header: "2x6" }] },
  ];
  const read = () => JSON.stringify(plan);
  const stop = main(["plan.json"], read);
  assert.equal(stop.code, 1);
  const r = main(["plan.json", "--skip-refused"], read);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /SKIPPED 1 WALL/);
  assert.match(r.out, /Wall Bad: .*king studs/);
  assert.doesNotMatch(r.out, /Wall Good: /);
  plan.walls = [plan.walls[1]];
  const all = main(["plan.json", "--skip-refused"], read);
  assert.equal(all.code, 1);
  assert.match(all.out, /Every wall was refused/);
});

test("--skip-refused does not refuse a wall only because the wall it tees into was skipped", () => {
  const plan = samplePlan();
  plan.walls = [
    { id: "Through", length: 192, stud: "2x4", tees: [96], openings: [{ kind: "door", label: "D", offset: 0, width: 36, height: 82.5, header: "2x6" }] },
    { id: "Stub", length: 96, stud: "2x4", tee: { wall: "Through", at: 96 }, openings: [] },
  ];
  const r = main(["plan.json", "--skip-refused"], () => JSON.stringify(plan));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /SKIPPED 1 WALL/);
  assert.match(r.out, /Wall Stub: its tee lap onto skipped wall Through was dropped/);
  assert.doesNotMatch(r.out, /- Wall Stub: /);
});

test("--shallow-headers swaps a header too deep for the plates and notes it", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "Tall", length: 192, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 48, width: 36, height: 85.5, headerHeight: 85.5, header: "2x10" }] }];
  const read = () => JSON.stringify(plan);
  const stop = main(["plan.json"], read);
  assert.equal(stop.code, 1);
  assert.match(stop.out, /too tall/);
  const r = main(["plan.json", "--shallow-headers"], read);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Note: Wall Tall, D: 2x10 header is .* too deep .* 2x\d+ \(/);
  const none = main(["plan.json", "--shallow-headers"], () => JSON.stringify({ ...plan, walls: [{ ...plan.walls[0], openings: [{ ...plan.walls[0].openings[0], headerHeight: 91, height: 91 }] }] }));
  assert.equal(none.code, 1);
  assert.match(none.out, /nothing on the lumber list fits|too tall/);
  const trimmed = main(["plan.json", "--shallow-headers", "--trim-openings"], () => JSON.stringify({ ...plan, walls: [{ ...plan.walls[0], openings: [{ ...plan.walls[0].openings[0], headerHeight: 91, height: 91 }] }] }));
  assert.equal(trimmed.code, 0, trimmed.out);
  assert.match(trimmed.out, /Note: Wall Tall, D: the opening is .* in taller than the room/);
});

test("--trim-openings lowers a door sitting on a threshold to the floor and leaves a raised one refused", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "Tall", length: 192, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 48, width: 36, height: 80, headerHeight: 80, header: "2x6" }] }];
  const door = plan.walls[0].openings[0];
  const withDoor = (o) => () => JSON.stringify({ ...plan, walls: [{ ...plan.walls[0], openings: [{ ...door, ...o }] }] });
  const h = 82;
  const low = main(["plan.json", "--shallow-headers", "--trim-openings"], withDoor({ headerHeight: h, height: h - 1.5 - 1.625 }));
  assert.equal(low.code, 0, low.out);
  assert.match(low.out, /door bottom is 1\.63 in above the floor/);
  const raised = main(["plan.json", "--shallow-headers", "--trim-openings"], withDoor({ headerHeight: h, height: h - 1.5 - 39 }));
  assert.equal(raised.code, 1);
  assert.match(raised.out, /should reach the floor/);
});

test("--doors-to-floor frames a raised door down to the floor, keeping the leaf, and notes it", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "Tall", length: 192, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 48, width: 36, height: 80, headerHeight: 80 + 1.5 + 39, header: "2x6" }] }];
  const read = () => JSON.stringify(plan);
  const off = main(["plan.json", "--skip-refused"], read);
  assert.match(off.out, /should reach the floor/);
  const on = main(["plan.json", "--doors-to-floor"], read);
  assert.equal(on.code, 0, on.out);
  assert.match(on.out, /door bottom is 39\.00 in above the floor/);
});

test("--whole-house equals the four flags it stands for", () => {
  const plan = samplePlan();
  plan.walls = [
    { id: "Good", length: 192, stud: "2x4", openings: [] },
    { id: "Bad", length: 120, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 0, width: 36, height: 82.5, header: "2x6" }] },
  ];
  const read = () => JSON.stringify(plan);
  const a = main(["plan.json", "--whole-house"], read);
  const b = main(["plan.json", "--skip-refused", "--doors-to-floor", "--shallow-headers", "--trim-openings"], read);
  assert.equal(a.code, b.code);
  assert.equal(a.out, b.out);
  assert.match(a.out, /SKIPPED 1 WALL/);
});

test("--fixed-plan prints the plan after --skip-refused, without the refused wall, and stops", () => {
  const plan = samplePlan();
  plan.walls = [
    { id: "Good", length: 192, stud: "2x4", openings: [] },
    { id: "Bad", length: 120, stud: "2x4", openings: [{ kind: "door", label: "D", offset: 0, width: 36, height: 82.5, header: "2x6" }] },
  ];
  const r = main(["plan.json", "--skip-refused", "--fixed-plan"], () => JSON.stringify(plan));
  assert.equal(r.code, 0, r.out);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.walls.map((w) => w.id), ["Good"]);
});
