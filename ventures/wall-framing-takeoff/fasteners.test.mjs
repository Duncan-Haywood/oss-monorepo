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
