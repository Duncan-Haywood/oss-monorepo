import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { layoutFloor, floorCuts, joistCentres, sampleFloor, floorText } from "./floor.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });

test("joist centres: edge joists plus every multiple of the spacing", () => {
  const c = joistCentres(480, 16);
  assert.equal(c[0], 0.75);
  assert.equal(c.at(-1), 479.25);
  assert.ok(c.includes(16) && c.includes(464));
  assert.ok(!c.includes(480)); // an interior centre never crowds the edge joist
});

test("a 40 x 28 ft floor with a beam gets two joist runs per line, each within the longest board", () => {
  const l = layoutFloor(sampleFloor(), plan());
  assert.ok(l.ok);
  assert.equal(l.joists.length, l.centres.length * 2);
  for (const j of l.joists) assert.ok(j.length <= 192);
  assert.equal(l.joists.filter((j) => j.y < 100).reduce((s, j) => s + j.length, 0) / l.centres.length, 168 - 1.5);
});

test("a joist run longer than the longest board is rejected with the way out", () => {
  const l = layoutFloor({ ...sampleFloor(), beam: undefined }, plan());
  assert.equal(l.ok, false);
  assert.match(l.errors[0], /beam/);
});

test("rim boards cover the full width and splice over a joist", () => {
  const l = layoutFloor(sampleFloor(), plan());
  for (const side of ["front", "back"]) {
    const ps = l.rims.filter((r) => r.side === side);
    assert.ok(Math.abs(ps.reduce((s, r) => s + r.length, 0) - 480) < 1e-6);
    let at = 0;
    for (const p of ps.slice(0, -1)) { at += p.length; assert.ok(l.centres.some((c) => Math.abs(c - at) < 1e-6)); }
  }
});

test("subfloor joints land on joist centres and alternate courses stagger", () => {
  const l = layoutFloor(sampleFloor(), plan());
  for (const c of l.courses) {
    const total = c.pieces.reduce((s, p) => s + p.length, 0);
    assert.ok(Math.abs(total - 480) < 1e-6);
    let at = 0;
    for (const p of c.pieces.slice(0, -1)) { at += p.length; assert.ok(l.centres.some((x) => Math.abs(x - at) < 1e-6), `joint at ${at}`); }
  }
  assert.notEqual(l.courses[0].pieces[0].length, l.courses[1].pieces[0].length);
  assert.equal(l.courses.length, 7); // 336 / 48
  assert.equal(l.sheets.count >= Math.ceil(l.sheets.area / 32), true);
});

test("a depth that is not a multiple of 4 ft ends in a ripped course and says so", () => {
  const l = layoutFloor({ ...sampleFloor(), depth: 330, beam: 160 }, plan());
  assert.equal(l.courses.at(-1).width, 330 - 6 * 48);
  assert.ok(l.notes.some((n) => /ripped/.test(n)));
});

test("floor lumber joins the wall order through takeoff", () => {
  const p = plan();
  const l = layoutFloor(sampleFloor(), p);
  const cuts = floorCuts(l);
  const r = takeoff({ ...p, walls: [{ id: "A", length: 120, stud: "2x4" }] }, cuts);
  assert.ok(r.ok);
  const need = l.joists.reduce((s, j) => s + j.length, 0) + l.rims.reduce((s, x) => s + x.length, 0);
  const o = r.orders.find((x) => x.size === "2x10");
  assert.ok(o.bought >= need);
  assert.ok(o.proven || o.cost >= o.bound);
});

test("blocking rows put a piece in every bay", () => {
  const l = layoutFloor({ ...sampleFloor(), blockingRows: 2 }, plan());
  assert.equal(l.blocks.length, 2 * (l.centres.length - 1));
  assert.ok(floorText(l).length > 5);
});

test("a wall along the joists gets a companion joist on its side, in the cut list as its own kind", () => {
  const l = layoutFloor({ ...sampleFloor(), doubleUnder: [100, 2] }, plan());
  assert.ok(l.ok);
  assert.equal(l.doubled.length, 2);
  assert.equal(l.joists.filter((j) => j.doubled).length, 4); // two runs each (beam)
  const near = l.doubled[0]; // wall at 100 in: nearest joist centre 96, companion on the + side
  assert.equal(near.x, l.centres[near.joist] + 1.5);
  assert.ok(l.doubled[1].x > l.centres[0]); // edge joist doubles inward
  const rows = floorCuts(l).filter((r) => r.kind === "doubled floor joist");
  assert.equal(rows.reduce((s, r) => s + r.qty, 0), 4);
  assert.equal(layoutFloor({ ...sampleFloor(), doubleUnder: [900] }, plan()).ok, false);
});

test("a stairwell cuts joists to tails, doubles trimmers and headers, and removes subfloor", () => {
  const base = layoutFloor({ ...sampleFloor(), beam: undefined, depth: 240, joist: "2x10" }, { ...plan(), stock: [{ size: "2x10", length: 240, price: 1 }] });
  const l = layoutFloor({ ...sampleFloor(), beam: undefined, depth: 240, stair: { x: 100, y: 60, width: 36, length: 120 } }, { ...plan(), stock: [{ size: "2x10", length: 240, price: 1 }] });
  assert.ok(l.ok, JSON.stringify(l.errors));
  const s = l.stairwell;
  assert.ok(s.width >= 36 && s.x <= 100 + 1e-6 && s.length === 120);
  assert.equal(s.headers.length, 4);
  assert.ok(s.tails >= 2 && s.tails % 2 === 0);
  // every cut joist's two tails stay clear of the opening and its headers
  for (const j of l.joists.filter((j) => j.tail)) assert.ok(j.y + j.length <= 60 - 3 + 1e-6 || j.y >= 60 + 120 + 3 - 1e-6);
  assert.ok(l.joists.filter((j) => j.trimmer).length === 2);
  assert.ok(l.sheets.area < base.sheets.area);
  assert.ok(floorCuts(l).some((c) => c.kind === "stairwell header" && c.qty === 4 || c.kind === "stairwell header"));
});

test("a stairwell that crosses the beam or hugs the edge is rejected", () => {
  assert.equal(layoutFloor({ ...sampleFloor(), stair: { x: 100, y: 150, width: 36, length: 40 } }, plan()).ok, false);
  assert.equal(layoutFloor({ ...sampleFloor(), stair: { x: 100, y: 2, width: 36, length: 40 } }, plan()).ok, false);
});
