import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { budget } from "./budget.mjs";
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

test("a stairwell cuts the joists it crosses, doubles the trimmers and headers, and keeps the lumber accounted for", () => {
  const base = layoutFloor(sampleFloor(), plan());
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 40, width: 36, depth: 100 }] }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  const [o] = l.openings;
  assert.equal(o.left, 96); // joist at or before x = 100
  assert.equal(o.right, 144); // first joist at or past 136
  assert.equal(o.clearWidth, 48 - 1.5);
  const tails = l.joists.filter((j) => j.tail);
  assert.equal(tails.length, 2 * 3); // joists at 112 and 128: front tail, rear tail, and the far span past the beam
  const hdr = l.joists.filter((j) => j.header);
  assert.equal(hdr.length, 4);
  assert.ok(hdr.every((h) => h.length === 48 - 1.5));
  assert.equal(l.joists.filter((j) => j.trimmer).length >= 2, true);
  // no joist piece enters a header zone
  for (const j of tails.filter((t) => t.y < 168)) assert.ok(j.y + j.length <= o.y - 3 + 1e-9 || j.y >= o.y + o.depth + 3 - 1e-9);
  // net joist length falls by the opening plus header zones, rises by the trimmers and headers
  const sum = (a) => a.reduce((s, j) => s + j.length, 0);
  assert.ok(sum(l.joists.filter((j) => !j.trimmer && !j.header)) < sum(base.joists));
  const rows = floorCuts(l);
  assert.equal(rows.filter((r) => r.kind === "floor header").reduce((s, r) => s + r.qty, 0), 4);
  assert.ok(takeoff({ ...plan(), walls: [{ id: "A", length: 120, stud: "2x4" }] }, rows).ok);
  assert.ok(floorText(l).join("\n").includes("clear"));
});

test("openings that leave the floor, are tiny or sit over the beam are refused", () => {
  const bad = (o) => layoutFloor({ ...sampleFloor(), openings: [o] }, plan());
  assert.equal(bad({ x: 100, y: 40, width: 6, depth: 100 }).ok, false);
  assert.equal(bad({ x: 460, y: 40, width: 36, depth: 100 }).ok, false);
  assert.equal(bad({ x: 100, y: 120, width: 36, depth: 100 }).ok, false); // over the beam at 168
  assert.equal(bad({ x: 100, y: 2, width: 36, depth: 60 }).ok, false);
});

test("the subfloor is cut around a stairwell: pieces inside are dropped, crossed ones shortened, bitten ones notched, and the area is exact", () => {
  const base = layoutFloor(sampleFloor(), plan());
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 40, width: 36, depth: 100 }] }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  const hole = (144 - 0.75 - (96 + 0.75)) * 100;
  assert.ok(Math.abs(l.sheets.area - (base.sheets.area - hole / 144)) < 1e-9);
  // piece area in the courses = floor area minus the opening, plus the notched rectangles' bitten corners (slivers aside)
  let covered = 0;
  for (const c of l.courses) for (const p of c.pieces) covered += p.length * c.width - (p.notches || []).reduce((s, n) => s + n.width * n.depth, 0);
  const gap = 480 * 336 - hole - covered; // slivers under 3 in beside the trimmers are offcut, at most one each side per course
  assert.ok(gap >= -1e-6 && gap <= 2 * 3 * 48 * l.courses.length, String(gap));
  assert.ok(l.sheets.count <= base.sheets.count);
  assert.ok(l.courses.some((c) => c.pieces.some((p) => p.notches)) || l.courses.some((c, i) => c.pieces.length !== base.courses[i].pieces.length));
  assert.ok(floorText(l).join("\n").includes("cut around the clear opening"));
});

test("two stairwells each get their own trimmers and headers, joists between them are cut by both, and overlapping ones are refused", () => {
  const one = (o) => layoutFloor({ ...sampleFloor(), openings: [o] }, plan());
  const a = { x: 100, y: 40, width: 36, depth: 100 }, b = { x: 300, y: 190, width: 36, depth: 100 };
  const l = layoutFloor({ ...sampleFloor(), openings: [a, b] }, plan());
  assert.ok(l.ok, JSON.stringify(l.errors));
  assert.equal(l.openings.length, 2);
  assert.equal(l.joists.filter((j) => j.header).length, 8);
  assert.equal(l.trimmers.length, 4);
  // headers and trimmers are exactly those of the two single-opening floors together
  const count = (r, k) => r.joists.filter((j) => j[k]).length;
  assert.equal(count(l, "header"), count(one(a), "header") + count(one(b), "header"));
  assert.equal(count(l, "trimmer"), count(one(a), "trimmer") + count(one(b), "trimmer"));
  // subfloor area is the floor minus both clear openings
  const base = layoutFloor(sampleFloor(), plan());
  const hole = (o) => (o.right - 0.75 - (o.left + 0.75)) * o.depth;
  const removed = l.openings.reduce((s, o) => s + hole(o), 0);
  assert.ok(Math.abs(l.sheets.area - (base.sheets.area - removed / 144)) < 1e-9);
  assert.ok(l.joists.every((j) => j.length > 0));
  // overlapping in plan, or sharing a trimmer bay, is refused; same joist bays but far apart in depth is fine
  const clash = layoutFloor({ ...sampleFloor(), openings: [a, { ...a, y: 100, depth: 40 }] }, plan());
  assert.equal(clash.ok, false);
  assert.match(clash.errors.join(" "), /too close/);
  assert.equal(layoutFloor({ ...sampleFloor(), openings: [a, { x: 120, y: 190, width: 24, depth: 60 }] }, plan()).ok, true);
  assert.equal(layoutFloor({ ...sampleFloor(), openings: [a, { x: 150, y: 40, width: 24, depth: 100 }] }, plan()).ok, false); // trimmers collide
});

test("joist hangers: tail-joist ends at the headers and four double hangers per opening, hand-counted", () => {
  assert.equal(layoutFloor(sampleFloor(), plan()).hangers.count, 0);
  // joists at 112 and 128 are cut by the stairwell (y 40 to 140, beam at 168): each has a piece ending at the front
  // header and a piece starting at the rear header; the span past the beam is whole. 2 lines x 2 ends = 4 singles.
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 40, width: 36, depth: 100 }] }, plan());
  assert.deepEqual([l.hangers.singles, l.hangers.doubles, l.hangers.count], [4, 4, 8]);
  assert.ok(floorText(l).join("\n").includes("8 hangers"));
  assert.ok(l.notes.some((n) => n.includes("8 joist hangers counted")));
  const b = budget({ floor: l }, { joistHanger: 2, doubleJoistHanger: 5 });
  const line = (n) => b.lines.find((x) => x.item === n);
  assert.equal(line("Joist hangers").qty, 4);
  assert.equal(line("Double joist hangers").qty, 4);
  assert.equal(line("Double joist hangers").amount, 20);
});

