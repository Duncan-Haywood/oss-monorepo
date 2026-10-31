import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { budget } from "./budget.mjs";
import { checkPenetrations, layoutFloor, floorCuts, joistCentres, sampleFloor, floorText } from "./floor.mjs";

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

test("hanger nails: typed per-hanger counts times the hangers counted, into the budget", () => {
  const o = [{ x: 100, y: 40, width: 36, depth: 100 }];
  assert.equal(layoutFloor({ ...sampleFloor(), openings: o }, plan()).hangers.nails, undefined);
  // 4 singles x 6 + 4 doubles x 10 = 64 nails
  const l = layoutFloor({ ...sampleFloor(), openings: o, hangerNails: { single: 6, double: 10 } }, plan());
  assert.equal(l.hangers.nails, 64);
  assert.ok(l.notes.some((n) => n.includes("64 hanger nails counted")));
  assert.equal(budget({ floor: l }, { hangerNail: 0.05 }).lines.find((x) => x.item === "Joist hanger nails").amount, 3.2);
  assert.equal(layoutFloor({ ...sampleFloor(), openings: o, hangerNails: { single: -1 } }, plan()).ok, false);
});

test("a cantilever lengthens the joists, rims and subfloor past the back support, hand-counted", () => {
  const base = layoutFloor(sampleFloor(), plan());
  const l = layoutFloor({ ...sampleFloor(), cantilever: 24 }, plan());
  assert.ok(l.ok);
  assert.equal(l.depth, 336 + 24);
  assert.equal(l.supportedDepth, 336);
  // the back run grows by exactly the overhang, the front run is unchanged
  const back = (r) => r.joists.filter((j) => j.y >= 168 && !j.header);
  assert.equal(back(l)[0].length - back(base)[0].length, 24);
  assert.equal(l.joists.filter((j) => j.y < 100)[0].length, base.joists.filter((j) => j.y < 100)[0].length);
  // 360 in is 7.5 courses of 48: seven full and one 24 in strip
  assert.equal(l.courses.length, 8);
  assert.equal(l.courses.at(-1).width, 24);
  assert.ok(l.sheets.area === 480 * 360 / 144);
  assert.ok(l.notes.some((n) => /cantilever 2. 0/i.test(n)) && !l.notes.some((n) => /rule of thumb/.test(n)));
});

test("a cantilever over a third of the span is flagged, and one over 8 ft is refused", () => {
  const l = layoutFloor({ ...sampleFloor(), cantilever: 120 }, plan());
  assert.equal(l.ok, false); // 10 ft is out of range
  const m = layoutFloor({ ...sampleFloor(), depth: 192, beam: 96, cantilever: 96 }, plan());
  assert.ok(m.ok);
  assert.ok(m.notes.some((n) => /rule of thumb/.test(n)));
});

test("joist holes and notches: 2x10 (9.25 in deep) against hand-worked limits", () => {
  // hole limit 9.25/3 = 3.083 in; notch 9.25/6 = 1.542 in, 3.083 in long; end notch 9.25/4 = 2.3125 in; middle third of 168 in is 56..112
  const r = checkPenetrations("2x10", 168, [
    { type: "hole", at: 40, size: 3 },
    { type: "hole", at: 40, size: 3.5 },
    { type: "hole", at: 40, size: 2, fromEdge: 1.5 },
    { type: "hole", at: 5, size: 2 },
    { type: "notch", at: 20, size: 1.5, length: 3 },
    { type: "notch", at: 20, size: 2, length: 3 },
    { type: "notch", at: 80, size: 1, length: 3 },
    { type: "notch", at: 54, size: 1, length: 3 },
    { type: "notch", at: 0, size: 2.25, length: 3, end: true },
    { type: "notch", at: 0, size: 2.5, length: 3, end: true },
  ]);
  assert.deepEqual(r.map((x) => x.ok), [true, false, false, false, true, false, false, false, true, false]);
  assert.match(r[1].why[0], /hole 3-1\/2.* is over 3-1\/16/);
  assert.match(r[6].why[0], /middle third/);
  assert.match(r[7].why[0], /reaches into the middle third/);
  assert.equal(checkPenetrations("2x10", 168, [{ type: "pipe", at: 1, size: 1 }])[0].why[0], "unknown type pipe");
});

test("floor layout reports a failing penetration as a note and passes the rows through", () => {
  const l = layoutFloor({ ...sampleFloor(), penetrations: [{ type: "hole", at: 60, size: 4 }, { type: "hole", at: 60, size: 2 }] }, samplePlan());
  assert.equal(l.penetrations.length, 2);
  assert.equal(l.penetrations[0].ok, false);
  assert.equal(l.penetrations[1].ok, true);
  assert.ok(l.notes.some((n) => /Joist hole 1:/.test(n)));
  assert.ok(!l.notes.some((n) => /Joist hole 2:/.test(n)));
});

test("stairwell header check: bending, shear and deflection by hand, typed figures only", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 30, width: 36, depth: 100 }], headerCheck: hc }, plan());
  assert.ok(l.ok);
  const front = l.headerChecks.find((r) => r.side === "front");
  // 25.5 in tail -> 12.75 in = 1.0625 ft strip x 50 psf = 53.125 lb/ft over 46.5 in clear
  assert.equal(front.span, 46.5);
  assert.equal(front.tail, 25.5);
  assert.ok(Math.abs(front.load - 53.125) < 1e-9);
  const S = (3 * 9.25 ** 2) / 6; // two 1.5 in plies, 9.25 in deep
  assert.ok(Math.abs(front.fb - (((53.125 / 12) * 46.5 ** 2) / 8) / S) < 1e-9);
  assert.ok(Math.abs(front.fv - (1.5 * ((53.125 / 12) * 46.5) / 2) / (3 * 9.25)) < 1e-9);
  assert.ok(front.ok);
  assert.ok(l.notes.some((n) => /front header.*passes/.test(n)));
});

test("a header that is too weak for the typed strengths is reported with what it breaks", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 20, Fv: 5, E: 1300000, deflLimit: 360 };
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 30, width: 36, depth: 100 }], headerCheck: hc }, plan());
  const back = l.headerChecks.find((r) => r.side === "back");
  assert.equal(back.ok, false);
  assert.ok(back.breaks.some((b) => /^bending/.test(b)) && back.breaks.some((b) => /^shear/.test(b)));
  assert.ok(l.notes.some((n) => /back header.*FAILS/.test(n)));
});

test("headerCheck needs typed loads and strengths and an opening", () => {
  assert.ok(layoutFloor({ ...sampleFloor(), headerCheck: { liveLoad: 40 } }, plan()).errors.some((e) => /headerCheck\.Fb/.test(e)));
  const none = layoutFloor({ ...sampleFloor(), headerCheck: { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 } }, plan());
  assert.ok(none.errors.some((e) => /at least one opening/.test(e)));
});

test("header end reaction is wL/2 and is checked against a typed hanger capacity", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const o = [{ x: 100, y: 30, width: 36, depth: 100 }];
  const front = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: hc }, plan()).headerChecks.find((r) => r.side === "front");
  assert.ok(Math.abs(front.reaction - (53.125 / 12) * 46.5 / 2) < 1e-9);
  const weak = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, hangerCapacity: 50 } }, plan()).headerChecks.find((r) => r.side === "front");
  assert.equal(weak.ok, false);
  assert.ok(weak.breaks.some((b) => /end reaction/.test(b)));
  assert.ok(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, hangerCapacity: -1 } }, plan()).errors.some((e) => /hangerCapacity/.test(e)));
});

test("trimmer check: point load from the header plus a half-spacing strip, by hand", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const l = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 30, width: 36, depth: 100 }], headerCheck: hc }, plan());
  const t = l.trimmerChecks.find((r) => r.side === "front");
  const h = l.headerChecks.find((r) => r.side === "front");
  assert.equal(t.point, h.reaction);
  // statics: reactions sum to the total load and the moment at the point load matches R1*a - w a^2/2
  const w = t.uniform / 12, L = t.span;
  assert.ok(Math.abs(t.reactions[0] + t.reactions[1] - (w * L + t.point)) < 1e-9);
  const a = t.a, R1 = (w * L) / 2 + (t.point * (L - a)) / L;
  assert.ok(t.moment >= R1 * a - (w * a * a) / 2 - 1e-9);
  assert.ok(Math.abs(t.fb - t.moment / ((3 * 9.25 ** 2) / 6)) < 1e-9);
  assert.ok(l.notes.some((n) => /trimmer under the front header/.test(n)));
  const weak = layoutFloor({ ...sampleFloor(), openings: [{ x: 100, y: 30, width: 36, depth: 100 }], headerCheck: { ...hc, Fb: 20 } }, plan());
  assert.equal(weak.trimmerChecks[0].ok, false);
});

test("stair top reaction adds a mid-span point load to the header it hangs from, by hand", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const o = [{ x: 100, y: 30, width: 36, depth: 100 }];
  const base = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: hc }, plan()).headerChecks.find((r) => r.side === "front");
  const withStair = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, stairReaction: 400, stairReactionLive: 320, stairSide: "front" } }, plan());
  const f = withStair.headerChecks.find((r) => r.side === "front"), b = withStair.headerChecks.find((r) => r.side === "back");
  const S = (3 * 9.25 ** 2) / 6, I = (3 * 9.25 ** 3) / 12, L = 46.5;
  assert.ok(Math.abs(f.fb - (base.fb + ((400 * L) / 4) / S)) < 1e-9);
  assert.ok(Math.abs(f.reaction - (base.reaction + 200)) < 1e-9);
  assert.ok(Math.abs(f.defl - (base.defl + (320 * L ** 3) / (48 * 1300000 * I))) < 1e-9);
  assert.ok(Math.abs(b.fb - layoutFloor({ ...sampleFloor(), openings: o, headerCheck: hc }, plan()).headerChecks.find((r) => r.side === "back").fb) < 1e-9, "the other header is unchanged");
  assert.ok(withStair.notes.some((n) => /400 lb top reaction as a mid-span point load/.test(n)));
  assert.ok(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, stairReaction: 400 } }, plan()).errors.some((e) => /stairSide/.test(e)));
  assert.ok(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, stairReaction: 400, stairSide: "front", stairReactionLive: 900 } }, plan()).errors.some((e) => /stairReactionLive/.test(e)));
});

test("trimmer end reaction is checked against a typed bearing capacity", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const o = [{ x: 100, y: 30, width: 36, depth: 100 }];
  const base = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: hc }, plan()).trimmerChecks[0];
  const big = Math.max(...base.reactions);
  const pass = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, bearingCapacity: big + 1 } }, plan()).trimmerChecks[0];
  assert.ok(!pass.breaks.some((b) => /bearing/.test(b)));
  const weak = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, bearingCapacity: big - 1 } }, plan()).trimmerChecks[0];
  assert.equal(weak.ok, false);
  assert.ok(weak.breaks.some((b) => /bearing capacity/.test(b)));
  assert.ok(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, bearingCapacity: 0 } }, plan()).errors.some((e) => /bearingCapacity/.test(e)));
});

test("header ties: straps = ceil(typed force / typed capacity), both required together", () => {
  const hc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 180, E: 1300000 };
  const o = [{ x: 100, y: 30, width: 36, depth: 100 }];
  const l = layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, tieForce: 2500, tieCapacity: 1000 } }, plan());
  assert.ok(l.ok);
  assert.ok(l.headerChecks.every((r) => r.ties === 3));
  assert.ok(l.notes.some((n) => /Ties: 3 straps at the typed 1000 lb each for the typed 2500 lb/.test(n)));
  assert.equal(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, tieForce: 1000, tieCapacity: 1000 } }, plan()).headerChecks[0].ties, 1);
  assert.equal(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: hc }, plan()).headerChecks[0].ties, null);
  assert.ok(layoutFloor({ ...sampleFloor(), openings: o, headerCheck: { ...hc, tieForce: 900 } }, plan()).errors.some((e) => /tieCapacity/.test(e)));
});
