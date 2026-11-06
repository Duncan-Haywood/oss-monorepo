import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFasteners, validateFasteners, fastenerText } from "./fasteners.mjs";
import { takeoff, samplePlan } from "./engine.mjs";
import { sheathe } from "./sheathing.mjs";

const m = (kind, label, o) => ({ kind, label, orient: "v", x: 0, y: 0, w: 1.5, h: 92.625, ...o });
const wall = (members) => ({ id: "A", length: 96, members });

test("stud ends, plates, jacks and header plies by hand", () => {
  const r = { walls: [wall([
    m("stud", "stud"), m("king", "king, W"), m("cripple", "top cripple, W", { h: 10 }),
    m("jack", "jack, W", { h: 82.5 }), // 4 end nails + ceil(82.5/12)+1 = 8 face nails
    m("header", "header ply, W", { orient: "h", w: 40, h: 9.25 }), m("header", "header ply, W", { orient: "h", w: 40, h: 9.25 }),
    m("plate", "bottom plate", { orient: "h", w: 96 }), m("plate", "cap plate", { orient: "h", w: 96 }),
    m("sill", "rough sill, W", { orient: "h", w: 36 }),
  ])] };
  const l = layoutFasteners({}, {}, r);
  const by = Object.fromEntries(l.connections.map((c) => [c.name, c.nails]));
  assert.equal(by["Stud, king and cripple ends"], 4 * 3 + 4); // stud, king, cripple, jack: 4 each
  assert.equal(by["Jack to king"], 8);
  assert.equal(by["Header ends"], 2 * 2 * 2); // two plies, 2 ends, 2 nails
  assert.equal(by["Header plies together"], 2 * (Math.ceil(40 / 16) + 1)); // one join, 2 rows, 4 per row
  assert.equal(by["Bottom plate to floor"], 7); // 96/16 + 1
  assert.equal(by["Cap plate to top plate"], 7);
  assert.equal(by["Rough sills"], 4);
  assert.equal(l.total, l.connections.reduce((s, c) => s + c.nails, 0));
  assert.equal(l.order, Math.ceil(l.total * 1.1));
});

test("typed counts replace defaults and boxes round up", () => {
  const r = { walls: [wall(Array.from({ length: 9 }, () => m("stud", "stud")))] };
  const l = layoutFasteners({ studEndNails: 3, waste: 0, nailsPerBox: 50, price: 5 }, {}, r);
  assert.equal(l.total, 54); // 9 studs x 2 ends x 3
  assert.equal(l.boxes, 2);
  assert.equal(l.cost, 10);
  assert.ok(!l.assumed.includes("studEndNails") && l.assumed.includes("plateSpacing"));
});

test("sheathing nails: edge ring plus intermediate studs, by hand", () => {
  const r = { walls: [wall([])], sheathing: { walls: [{ id: "A", panels: [{ x0: 0, x1: 48, width: 48, height: 96 }] }] } };
  const l = layoutFasteners({ waste: 0 }, { studSpacing: 16 }, r);
  // edge: 2 x (48 + 96) / 6 = 48; studs at 16 and 32 inside: 2 lines x 96/12 = 8 each
  assert.equal(l.connections.find((c) => c.name === "Sheathing nails").nails, 48 + 16);
  assert.equal(layoutFasteners({ sheathing: false }, {}, r).sheathingCounted, false);
});

test("bad inputs are refused", () => {
  assert.equal(validateFasteners({ edgeSpacing: 1 }).length, 1);
  assert.equal(layoutFasteners({ waste: 2 }, {}, { walls: [] }).ok, false);
});

test("example house: sheathing adds nails, every wall is counted, text prints", () => {
  const p = samplePlan(), r = takeoff(p);
  const bare = layoutFasteners({}, p, r);
  assert.ok(bare.ok && bare.total > 1000 && !bare.sheathingCounted);
  assert.equal(bare.walls.length, r.walls.length);
  r.sheathing = sheathe(p, r);
  const full = layoutFasteners({ nailsPerBox: 2500, price: 40 }, p, r);
  assert.ok(full.sheathingCounted && full.total > bare.total);
  assert.equal(full.walls.reduce((s, w) => s + w.nails, 0), full.total);
  assert.match(fastenerText(full).join("\n"), /box\(es\) of 2500/);
});

test("hold-downs: wall ends and both sides of wide openings, by hand", () => {
  const plan = { walls: [{ id: "A", openings: [{ width: 36 }, { width: 72 }] }, { id: "B", openings: [] }] };
  const r = { walls: [wall([]), { id: "B", length: 96, members: [] }] };
  const l = layoutFasteners({ holdDowns: { wallEnds: true, openingMinWidth: 48, price: 25 } }, plan, r);
  assert.deepEqual(l.holdDowns, { wallEnds: 4, openingSides: 2, count: 6, price: 25, cost: 150 });
  assert.equal(layoutFasteners({}, plan, r).holdDowns, null);
  assert.equal(layoutFasteners({ holdDowns: { openingMinWidth: 2 } }, plan, r).ok, false);
  assert.match(fastenerText(l).join("\n"), /6 hold-down\(s\): 4 at wall ends, 2 beside wide openings, 150.00/);
});

test("rafter ties: one per rafter bearing, two per truss, by hand", () => {
  const r = { walls: [wall([])], roof: { rafters: new Array(10).fill({}), jacks: new Array(4).fill({}) } };
  const l = layoutFasteners({ rafterTies: { perBearing: 2, price: 1.5 } }, {}, r);
  assert.deepEqual(l.rafterTies, { trusses: 0, rafters: 14, bearings: 14, perBearing: 2, count: 28, price: 1.5, cost: 42 });
  const t = layoutFasteners({ rafterTies: true }, {}, { walls: [wall([])], roof: { trusses: { count: 12 }, rafters: [] } });
  assert.equal(t.rafterTies.count, 24);
  assert.equal(layoutFasteners({ rafterTies: true }, {}, r).rafterTies.count, 14);
  assert.equal(layoutFasteners({}, {}, r).rafterTies, null);
  assert.equal(layoutFasteners({ rafterTies: { perBearing: 3 } }, {}, r).ok, false);
  assert.match(fastenerText(l).join("\n"), /28 rafter tie\(s\): 2 on each of 14 bearing/);
});

test("plate straps: joints and single-top-plate ties by hand", () => {
  const r = { walls: [
    { id: "A", members: [], joints: { bottom: [], top: [48, 120], cap: [72] } },
    { id: "B", members: [], joints: { bottom: [], top: [60], cap: [] }, plateTies: 3 },
  ] };
  const l = layoutFasteners({ plateStraps: { price: 4 } }, {}, r);
  assert.deepEqual([l.plateStraps.topJoints, l.plateStraps.capJoints, l.plateStraps.plateTies], [3, 1, 3]);
  assert.equal(l.plateStraps.count, 7);
  assert.equal(l.plateStraps.cost, 28);
  assert.equal(layoutFasteners({ plateStraps: { perJoint: 2, plateTies: false, capJoints: false } }, {}, r).plateStraps.count, 6);
  assert.equal(layoutFasteners({}, {}, r).plateStraps, null);
  assert.ok(validateFasteners({ plateStraps: { perJoint: 3 } }).length === 1);
  assert.match(fastenerText(l).join("\n"), /7 plate strap\(s\)/);
});

test("wall bracing: count per wall and brace length by hand, off by default", () => {
  const r = { walls: [
    { id: "A", length: 480, height: 97.125, members: [] }, // ceil(480/300) = 2
    { id: "B", length: 300, height: 97.125, members: [] }, // exactly 1
    { id: "C", length: 36, height: 97.125, members: [] },  // under 48 in: skipped
  ] };
  assert.equal(layoutFasteners({}, {}, r).wallBracing, null);
  const l = layoutFasteners({ wallBracing: { price: 20 } }, {}, r).wallBracing;
  assert.equal(l.count, 3);
  assert.equal(l.walls, 2);
  assert.ok(Math.abs(l.feet - (3 * 97.125 * Math.SQRT2) / 12) < 1e-9); // 45 degrees: height x sqrt 2
  assert.equal(l.cost, 60);
  const steep = layoutFasteners({ wallBracing: { angle: 60, spacing: 120 } }, {}, r).wallBracing;
  assert.equal(steep.count, 4 + 3); // 480/120 = 4, 300/120 -> 3
  assert.ok(Math.abs(steep.feet - (7 * 97.125) / Math.sin(Math.PI / 3) / 12) < 1e-9);
  assert.ok(fastenerText(layoutFasteners({ wallBracing: true }, {}, r)).some((t) => t.includes("wall brace")));
  for (const bad of [{ spacing: 5 }, { angle: 80 }, { minWallLength: 1 }, { price: -1 }])
    assert.ok(validateFasteners({ wallBracing: bad }).length > 0, JSON.stringify(bad));
  assert.ok(validateFasteners({ wallBracing: "yes" }).length > 0);
});

test("wall bracing nails: typed per brace, joins the nail total, off by default", () => {
  const r = { walls: [{ id: "A", length: 480, height: 97.125, members: [] }] };
  const off = layoutFasteners({ wallBracing: true }, {}, r);
  assert.equal(off.total, 0);
  const on = layoutFasteners({ wallBracing: { nailsPerBrace: 12 } }, {}, r);
  assert.equal(on.total, 24); // 2 braces x 12
  assert.equal(on.walls.find((w) => w.id === "A").nails, 24);
  assert.equal(on.connections.find((c) => c.name === "Wall braces").nails, 24);
  for (const bad of [-1, 1.5, 500]) assert.ok(validateFasteners({ wallBracing: { nailsPerBrace: bad } }).length > 0);
});

test("blocking pieces are end-nailed: two ends, typed nails per end, by hand", () => {
  const r = { walls: [wall(Array.from({ length: 5 }, () => m("blocking", "fire blocking")))] };
  const l = layoutFasteners({ waste: 0 }, {}, r);
  assert.equal(l.connections.find((c) => c.name === "Blocking ends").nails, 5 * 2 * 2);
  assert.equal(layoutFasteners({ waste: 0, blockingEndNails: 3 }, {}, r).total, 5 * 2 * 3);
  assert.ok(validateFasteners({ blockingEndNails: 9 }).length > 0);
});

test("roof nails: plate toenails, ridge nails and collar tie ends, by hand", () => {
  const r = { walls: [wall([])], roof: { rafters: new Array(10).fill({}), jacks: new Array(4).fill({}), collarTies: new Array(3).fill({}), wingRafters: new Array(2).fill({}) } };
  const base = layoutFasteners({}, {}, r).total;
  const l = layoutFasteners({ roofNails: true }, {}, r);
  // bearings 12 commons + 4 jacks = 16 x 3; ridge 12 x 3; collar 3 ties x 2 ends x 4
  assert.equal(l.total - base, 48 + 36 + 24);
  assert.deepEqual(l.roofNails, { commons: 12, jacks: 4, collarTies: 3, rafterToPlate: 3, rafterToRidge: 3, collarTieEnd: 4, count: 108 });
  const z = layoutFasteners({ roofNails: { rafterToPlate: 2, rafterToRidge: 0, collarTieEnd: 0 } }, {}, r);
  assert.equal(z.total - base, 32);
  assert.equal(layoutFasteners({ roofNails: true }, {}, { walls: [wall([])], roof: { trusses: { count: 5 }, rafters: [] } }).roofNails, null);
  assert.equal(layoutFasteners({ roofNails: { rafterToPlate: 1.5 } }, {}, r).ok, false);
  // trusses: 5 trusses x 2 bearings x 2 toenails = 20, only when typed
  const tr = { walls: [wall([])], roof: { trusses: { count: 5 }, rafters: [] } };
  const tb = layoutFasteners({}, {}, tr).total;
  const tl = layoutFasteners({ roofNails: { trussToPlate: 2 } }, {}, tr);
  assert.equal(tl.total - tb, 20);
  assert.deepEqual(tl.roofNails, { trusses: 5, trussBearings: 10, trussToPlate: 2, count: 20 });
  assert.equal(layoutFasteners({ roofNails: { trussToPlate: 21 } }, {}, tr).ok, false);
  assert.equal(layoutFasteners({}, {}, r).roofNails, null);
});
