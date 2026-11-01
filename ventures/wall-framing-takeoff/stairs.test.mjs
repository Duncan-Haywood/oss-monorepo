import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan, formatLength } from "./engine.mjs";
import { layoutStair, stairCuts, stairText, sampleStair, validateStair, layoutStairWithLanding, landingCuts, landingText, checkPostSlenderness, checkLandingPostColumn, checkLandingJoists, flightPostLoad } from "./stairs.mjs";
import { checkStringer, checkTread, checkGuardPost } from "./stairs.mjs";
import { checkWinders, winderText, layoutLandingGuard } from "./stairs.mjs";

const plan = () => ({ ...samplePlan(), walls: [] });

test("9 ft floor-to-floor (108 in) takes 14 risers of 7-5/7 in and 13 treads", () => {
  const l = layoutStair({ totalRise: 108, tread: 10 }, plan());
  assert.ok(l.ok);
  assert.equal(l.risers, 14); // 108 / 7.75 = 13.94
  assert.ok(Math.abs(l.riser - 108 / 14) < 1e-12);
  assert.equal(l.treads, 13);
  assert.equal(l.run, 130);
});

test("equal risers add up to the total rise, with the first cut short by the tread thickness", () => {
  const l = layoutStair(sampleStair(), plan());
  assert.ok(Math.abs(l.firstRiserCut - (l.riser - 1.5)) < 1e-12);
  assert.ok(Math.abs(l.sumRise + 1.5 - l.totalRise + (l.totalRise - l.risers * l.riser)) < 1e-9);
  assert.ok(l.riser <= 7.75);
});

test("throat under the notches matches R*T/hypot subtracted from the board depth", () => {
  const l = layoutStair({ totalRise: 105, tread: 10, stringer: "2x12" }, plan()); // 14 risers of 7.5
  assert.ok(Math.abs(l.stringer.throat - (11.25 - (7.5 * 10) / 12.5)) < 1e-9); // 11.25 - 6 = 5.25
});

test("a 2x10 stringer with a steep, short step flags a thin throat", () => {
  const l = layoutStair({ totalRise: 100, tread: 10, stringer: "2x8" }, plan());
  assert.ok(l.ok);
  assert.ok(l.stringer.throat < 3.5 || l.notes.length === 0);
  const thin = layoutStair({ totalRise: 108, tread: 10, stringer: "2x8" }, plan());
  assert.ok(thin.stringer.throat < 3.5);
  assert.ok(thin.notes.some((n) => /left under the notches/.test(n)));
});

test("stairwell opening: headroom at the edge is x*R/T minus the floor above", () => {
  const l = layoutStair({ totalRise: 105, tread: 10, floorThickness: 12, openingLength: 120 }, plan());
  assert.ok(Math.abs(l.opening.headroom - (120 * 7.5 / 10 - 12)) < 1e-9); // 78 in
  assert.equal(l.opening.ok, false);
  assert.ok(Math.abs(l.minOpening - (92 * 10) / 7.5) < 0.07); // 122.67
  const ok = layoutStair({ totalRise: 105, tread: 10, floorThickness: 12, openingLength: 124 }, plan());
  assert.ok(ok.opening.ok);
});

test("a rise over 147 in needs a landing; a narrow or shallow-tread stair is refused", () => {
  assert.match(layoutStair({ totalRise: 150 }, plan()).errors[0], /landing/);
  assert.match(layoutStair({ totalRise: 100, tread: 9 }, plan()).errors[0], /minimum/);
  assert.match(validateStair({ totalRise: 100, width: 30 })[0], /minimum/);
});

test("stringer count keeps spacing within the limit", () => {
  const l = layoutStair({ totalRise: 108, tread: 10, width: 36 }, plan());
  assert.equal(l.stringer.count, 4);
  assert.ok(l.stringer.spacing <= 16);
  assert.equal(layoutStair({ totalRise: 108, tread: 10, width: 60 }, plan()).stringer.count, 5);
});

test("a stringer longer than any listed board is refused", () => {
  const p = plan();
  p.stock = p.stock.filter((s) => !(s.size === "2x12" && s.length > 96));
  const l = layoutStair({ totalRise: 108, tread: 10 }, p);
  assert.equal(l.ok, false);
  assert.match(l.errors[0], /longest listed/);
});

test("stair lumber joins the cutting-stock order", () => {
  const l = layoutStair(sampleStair(), plan());
  const cuts = stairCuts(l);
  assert.equal(cuts[0].kind, "stair stringer");
  const r = takeoff(samplePlan(), cuts);
  assert.ok(r.ok);
  assert.ok(r.cuts.some((c) => c.kind === "stair stringer" && c.qty === l.stringer.count));
  assert.match(stairText(l).join("\n"), /risers of/);
});

test("a rise of exactly 147 in is one flight; 147-1/8 in needs a landing", () => {
  assert.deepEqual(validateStair({ totalRise: 147 }), []);
  assert.match(validateStair({ totalRise: 147.125 })[0], /landing/);
});

test("the stringer angle is atan(riser/tread) in degrees", () => {
  const l = layoutStair({ totalRise: 105, tread: 10 }, plan()); // 14 risers of 7.5
  assert.ok(Math.abs(l.angle - (Math.atan2(7.5, 10) * 180) / Math.PI) < 1e-9); // 36.87
});

test("with no board of the stringer size listed, the refusal says the longest listed is zero", () => {
  const p = plan();
  p.stock = p.stock.filter((s) => s.size !== "2x12");
  const l = layoutStair({ totalRise: 108, tread: 10, stringer: "2x12" }, p);
  assert.equal(l.ok, false);
  assert.ok(l.errors[0].includes(`longest listed is ${formatLength(0)}`));
});

test("layout marks: only the first step has zero run", () => {
  const l = layoutStair({ totalRise: 108, tread: 10 }, plan());
  assert.deepEqual(l.marks.map((m) => m.run), l.marks.map((_, i) => (i === 0 ? 0 : 10)));
});

test("a 160 in rise splits at a landing into two flights that add up", () => {
  const r = layoutStairWithLanding({ totalRise: 160, tread: 10, width: 36 }, plan());
  assert.ok(r.ok);
  assert.equal(r.landing.rise, 80);
  assert.equal(r.flights.length, 2);
  assert.ok(Math.abs(r.flights[0].totalRise + r.flights[1].totalRise - 160) < 1e-9);
  assert.equal(r.flights[0].risers, 11); // 80 / 7.75 = 10.3
  assert.ok(r.flights.every((f) => f.riser <= 7.75));
});

test("landing is as deep as the stair is wide, 36 in at least, and framed on 16 in joists", () => {
  const r = layoutStairWithLanding({ totalRise: 160, width: 48 }, plan());
  assert.equal(r.landing.depth, 48);
  assert.equal(r.landing.joists.count, 4); // 46.5 / 16 = 2.9 -> 3 bays
  assert.equal(r.landing.deck.count, Math.ceil(48.25 / 11.5)); // 2x12 deck boards
  assert.ok(Math.abs(r.landing.deck.area - 16) < 1e-9);
  assert.match(layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 40 } }, plan()).errors[0], /deep/);
});

test("a typed landing height moves the split; one that leaves a short flight is refused; only the upper flight has the opening", () => {
  const r = layoutStairWithLanding({ totalRise: 160, floorThickness: 12, openingLength: 200, landing: { landingRise: 60 } }, plan());
  assert.equal(r.flights[0].totalRise, 60);
  assert.equal(r.flights[0].opening, null);
  assert.ok(r.flights[1].opening);
  assert.match(layoutStairWithLanding({ totalRise: 160, landing: { landingRise: 8 } }, plan()).errors[0], /under 1 ft/);
});

test("landing lumber joins the order with both flights'", () => {
  const r = layoutStairWithLanding({ totalRise: 160 }, plan());
  const cuts = [...r.flights.flatMap(stairCuts), ...landingCuts(r)];
  assert.deepEqual(cuts.map((c) => c.kind), ["stair stringer", "stair tread", "stair stringer", "stair tread", "landing joist", "landing rim", "landing deck board"]);
  const t = takeoff(samplePlan(), cuts);
  assert.ok(t.ok);
  assert.match(landingText(r).join("\n"), /Landing: .* joists/);
});

test("a one-flight rise without a landing is pointed at layoutStair", () => {
  assert.match(layoutStairWithLanding({ totalRise: 100 }, plan()).errors[0], /layoutStair/);
});

test("rail: balusters keep every clear gap under 4 in and are one length", () => {
  const l = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1 } }, plan());
  assert.ok(l.ok && l.rail);
  const q = l.rail;
  assert.equal(q.segments, 3); // pitch hypot(108 - 7.714, 130) = 164.2 in over 72
  assert.equal(q.posts.count, 4);
  assert.ok(q.balusters.gap <= 4 + 1e-9 && q.balusters.gap > 2);
  // 130 in run over 3 segments, 3.5 in posts: 39.83 in clear; ceil((39.83-4)/5.5) = 7 balusters
  assert.equal(q.balusters.perSegment, 7);
  assert.equal(q.balusters.count, 21);
  assert.ok(Math.abs(q.balusters.length - (36 - 3 - 4 + 1.5 * (108 / 14) / 10)) < 1e-9);
  assert.ok(Math.abs(q.handrail.length - (l.pitch + 22)) < 1e-9);
});

test("rail: two guarded sides double the parts, and guard rails join the order", () => {
  const one = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1 } }, plan());
  const two = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 2 } }, plan());
  assert.equal(two.rail.balusters.count, 2 * one.rail.balusters.count);
  const row = stairCuts(two).find((r) => r.kind === "stair guard rail");
  assert.equal(row.qty, 4);
  assert.ok(stairText(two).some((x) => /Guard \(2 sides/.test(x)));
});

test("rail: a handrail height outside 34 to 38 in is flagged", () => {
  const l = layoutStair({ totalRise: 108, tread: 10, rail: { handrailHeight: 40 } }, plan());
  assert.ok(l.notes.some((n) => /Handrail height 40/.test(n)));
});


test("three 30 degree winders with a zero pivot fail the 6 in rule, and the solved radius passes", () => {
  const z = checkWinders({ count: 3, innerRadius: 0 });
  assert.equal(z.ok, false);
  assert.equal(z.narrow, 0);
  assert.ok(Math.abs(z.walk - 12 * Math.PI / 6) < 1e-9); // 6.28 in at 12 in out
  assert.ok(Math.abs(z.minInnerRadius - 6 / (Math.PI / 6)) < 1e-9); // 11.459 in, from the 6 in rule
  assert.equal(checkWinders({ count: 3, innerRadius: z.minInnerRadius }).ok, true);
  assert.equal(checkWinders({ count: 3, innerRadius: z.minInnerRadius - 0.1 }).ok, false);
});

test("the 10 in walkline rule binds when treads are few and wide, the 6 in rule when many", () => {
  assert.ok(Math.abs(checkWinders({ count: 2 }).minInnerRadius - Math.max(6 / (Math.PI / 4), 10 / (Math.PI / 4) - 12)) < 1e-9);
  const w = checkWinders({ count: 3, turn: 60, innerRadius: 0 }); // 20 degree treads, theta .349
  assert.ok(Math.abs(w.minInnerRadius - Math.max(6 / (Math.PI / 9), 10 / (Math.PI / 9) - 12)) < 1e-9);
  assert.ok(checkWinders({ count: 4 }).minInnerRadius > checkWinders({ count: 3 }).minInnerRadius);
});

test("winder input is validated and the text names the fix", () => {
  assert.equal(checkWinders({ count: 1 }).ok, false);
  assert.equal(checkWinders({ turn: 0 }).ok, false);
  assert.match(winderText(checkWinders({ count: 3 })).join("\n"), /smallest inner radius that passes is 11\.5 in/);
  assert.match(winderText(checkWinders({ count: 3, innerRadius: 12 })).join("\n"), /pass/);
});

test("landing guard: a 48 in end edge and a 36 in side edge keep gaps under 4 in and add rails to the order", () => {
  const r = layoutStairWithLanding({ totalRise: 160, tread: 10, landing: { openEdges: ["end", "side"] } }, plan());
  assert.ok(r.ok && r.landing.guard);
  const g = r.landing.guard;
  assert.deepEqual(g.edges, [36, 36]); // width 36 default, depth 36
  assert.equal(g.posts.count, 3); // one segment per edge, 2 posts each, the shared corner post counted once
  assert.ok(g.balusters.maxGap <= 4 + 1e-9);
  // hand check, 36 in edge: clear 32.5, ceil((32.5-4)/5.5)=6 balusters, gap (32.5-9)/7 = 3.357
  assert.equal(g.balusters.count, 12);
  assert.ok(Math.abs(g.balusters.length - 29) < 1e-9); // 36 - 2x1.5 rails - 4 bottom gap
  assert.equal(landingCuts(r).filter((c) => c.kind === "landing guard rail").length, 2);
  assert.ok(landingText(r).some((t) => /Landing guard/.test(t)));
});

test("landing guard: two end edges and one side edge share two corners", () => {
  const r = layoutStairWithLanding({ totalRise: 160, tread: 10, landing: { openEdges: ["end", "end", "side"] } }, plan());
  assert.equal(r.landing.guard.posts.count, 6 - 2);
  assert.equal(layoutLandingGuard([36, 36], {}, 1).posts.count, 3);
});

test("landing guard: an edge over 72 in gets a middle post", () => {
  assert.equal(layoutLandingGuard([96]).posts.count, 3);
  assert.equal(layoutLandingGuard([96]).guardRails.count, 2);
});

test("riser boards join the order only when a riser board is typed", () => {
  const none = layoutStair({ totalRise: 108, tread: 10 }, plan());
  assert.ok(!stairCuts(none).some((r) => r.kind === "stair riser"));
  const l = layoutStair({ totalRise: 108, tread: 10, riserBoard: "2x8" }, plan()); // riser 7-5/7 in, a 7-1/4 in board is short: two per riser
  assert.equal(l.riserStock.perRiser, 2);
  const row = stairCuts(l).find((r) => r.kind === "stair riser");
  assert.equal(row.qty, 28);
  assert.equal(row.length, 36);
  const tall = layoutStair({ totalRise: 108, tread: 10, riserBoard: "2x10" }, plan());
  assert.equal(stairCuts(tall).find((r) => r.kind === "stair riser").qty, 14);
  assert.ok(stairText(tall).some((x) => /14 risers of 14 2x10 boards/.test(x)));
  assert.ok(layoutStair({ totalRise: 108, tread: 10, riserBoard: "1x8" }, plan()).errors.some((e) => /riser board size/.test(e)));
  assert.ok(!stairCuts(layoutStair({ totalRise: 108, tread: 10, riserBoard: "2x10", openRisers: true }, plan())).some((r) => r.kind === "stair riser"));
});

test("rail: the handrail is bought as one board of the pitch plus the overhangs", () => {
  const l = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 2 } }, plan());
  const row = stairCuts(l).find((r) => r.kind === "stair handrail");
  assert.equal(row.qty, 1);
  assert.equal(row.length, Math.round((l.pitch + 22) * 16) / 16);
  assert.ok(!stairCuts(layoutStair({ totalRise: 108, tread: 10, rail: { handrail: false } }, plan())).some((r) => r.kind === "stair handrail"));
});

test("tread span between stringers is checked against the tread thickness", () => {
  // width 60, spacing 24, 1 in treads: span 58.5 -> 4 stringers, 19.5 in apart, over the 12 in limit for under 1-1/4 in.
  const bad = layoutStair({ totalRise: 108, width: 60, stringerSpacing: 24, treadThickness: 1 }, plan());
  assert.equal(bad.stringer.count, 4);
  assert.equal(bad.stringer.spacing, 19.5);
  assert.equal(bad.stringer.treadSpanMax, 12);
  assert.ok(bad.notes.some((n) => /between stringers/.test(n)));
  // the same stair with 2x treads (24 in) and the sample 36 in stair raise no span note
  const ok = layoutStair({ totalRise: 108, width: 60, stringerSpacing: 24, treadThickness: 1.5 }, plan());
  assert.ok(!ok.notes.some((n) => /between stringers/.test(n)));
  assert.ok(!layoutStair({ totalRise: 108 }, plan()).notes.some((n) => /between stringers/.test(n)));
});

test("open risers: the gap is the riser less the tread thickness, flagged over 4 in (hand: 108 in rise, 14 risers of 7-5/7 in, 1-1/2 in treads leave 6.21 in)", () => {
  const open = layoutStair({ ...sampleStair(), openRisers: true });
  const gap = 108 / 14 - 1.5;
  assert.ok(open.notes.some((n) => /Open risers leave a 6-3\/16" gap/.test(n) && n.includes("4 in")), open.notes.join("|"));
  assert.ok(gap > 6.2 && gap < 6.22);
  // solid risers have no gap to check
  assert.ok(!layoutStair(sampleStair()).notes.some((n) => /Open risers/.test(n)));
  // a tread thick enough to close the gap (riser 7-5/7 less 3-11/16 in) passes, and the limit is typed
  assert.ok(!layoutStair({ ...sampleStair(), openRisers: true, treadThickness: 3.75 }).notes.some((n) => /Open risers/.test(n)));
  assert.ok(!layoutStair({ ...sampleStair(), openRisers: true, limits: { openRiserGap: 6.5 } }).notes.some((n) => /Open risers/.test(n)));
});

test("the nosing note is for solid risers only: open risers skip it", () => {
  const solid = layoutStair({ ...sampleStair(), nosing: 2 });
  const open = layoutStair({ ...sampleStair(), nosing: 2, openRisers: true });
  assert.ok(solid.notes.some((n) => /Nosing 2 in/.test(n)));
  assert.ok(!open.notes.some((n) => /Nosing/.test(n)));
});

test("landing posts: four corners on a 36 in landing, extras once a side passes the typed spacing", () => {
  const a = layoutStairWithLanding({ totalRise: 160, landing: true }, plan());
  assert.equal(a.landing.posts.count, 4);
  assert.equal(a.landing.posts.height, 80 - 7.25 - 1.5); // 2x8 joist is 7-1/4 in
  const b = layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, postSpacing: 60 } }, plan());
  assert.deepEqual([b.landing.posts.alongBays, b.landing.posts.acrossBays, b.landing.posts.count], [1, 2, 6]);
  assert.match(landingText(a).join("\n"), /Landing posts: 4/);
});

test("landing footings: sized only when soilBearing is typed, from hand-computed tributary loads", () => {
  assert.equal(layoutStairWithLanding({ totalRise: 160, landing: true }, plan()).landing.footings, null);
  // 36 x 36 in, one bay: a corner post takes a quarter bay = 2.25 sq ft x 50 psf = 112.5 lb; 112.5/1500 psf = 10.8 sq in
  const a = layoutStairWithLanding({ totalRise: 160, landing: { soilBearing: 1500 } }, plan()).landing.footings;
  assert.equal(a.load, 112.5);
  assert.equal(a.area.toFixed(1), "10.8");
  assert.deepEqual([a.round, a.square, a.count], [4, 4, 4]);
  // 48 x 120 in with 60 in spacing: two bays across, an edge post takes half of a 20 sq ft bay = 10 sq ft x 50 = 500 lb; 48 sq in
  const b = layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, postSpacing: 60, soilBearing: 1500 } }, plan());
  assert.deepEqual([b.landing.footings.load, b.landing.footings.round, b.landing.footings.square, b.landing.footings.count], [500, 8, 7, 6]);
  assert.match(landingText(b).join("\n"), /Landing footings: heaviest post 500 lb .* 8 in round or 7 in square, 6 footings/);
});

test("landing post check: heaviest post load against a typed capacity (hand: 500 lb edge post)", () => {
  const f = (cap) => layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, postSpacing: 60, soilBearing: 1500, postCapacity: cap } }, plan());
  assert.equal(f(600).landing.footings.postOk, true);
  assert.equal(f(400).landing.footings.postOk, false);
  assert.match(landingText(f(400)).join("\n"), /500 lb against your 400 lb capacity: OVER/);
  assert.equal(f(undefined).landing.footings.postOk, null);
});

test("handrail brackets: ends plus enough between that none is past the typed spacing (hand: 108 in rise, 10 in tread)", () => {
  const l = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1 } }, plan());
  const len = l.rail.handrail.length;
  assert.equal(l.rail.handrail.brackets, Math.ceil(len / 48) + 1);
  assert.ok(len / (l.rail.handrail.brackets - 1) <= 48);
  const tight = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1, bracketSpacing: 24 } }, plan());
  assert.equal(tight.rail.handrail.brackets, Math.ceil(len / 24) + 1);
  assert.equal(layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1, handrail: false } }, plan()).rail.handrail, null);
  assert.match(stairText(l).join("\n"), new RegExp(`on ${l.rail.handrail.brackets} brackets`));
});

import { layoutWinders } from "./stairs.mjs";
test("winder treads: three 30 degree treads at 12 in inner radius, hand geometry", () => {
  const l = layoutWinders({ count: 3, innerRadius: 12 });
  assert.equal(l.treads.length, 3);
  // tread 1: radial edges at 0 and 30 degrees, radii 12 and 48
  const [a, b, c, d] = l.treads[0].corners;
  assert.deepEqual(a.map((v) => +v.toFixed(6)), [12, 0]);
  assert.deepEqual(b.map((v) => +v.toFixed(6)), [48, 0]);
  assert.deepEqual(c.map((v) => +v.toFixed(3)), [41.569, 24]);
  assert.deepEqual(d.map((v) => +v.toFixed(3)), [10.392, 6]);
  // shoelace area of the quadrilateral: 1/2 sin(30) (48^2 - 12^2) = 540
  assert.ok(Math.abs(l.treads[0].area - 540) < 1e-9);
  assert.ok(Math.abs(l.treads[0].blank.x - 37.608) < 1e-3 && Math.abs(l.treads[0].blank.y - 24) < 1e-9);
  // chord at the narrow end: 2 x 12 x sin 15 = 6.212; at 24 in: 12.423
  assert.ok(Math.abs(l.chordNarrow - 6.2117) < 1e-3 && Math.abs(l.chordWalk - 12.4233) < 1e-3);
  assert.equal(l.chordPasses, true);
});
test("winder framing: three treads need four radial supports, two shared (hand: 4 x 36 = 144 in)", () => {
  const f = layoutWinders({ count: 3, innerRadius: 12 }).framing;
  assert.deepEqual(f, { supports: 4, supportLength: 36, totalLength: 144, treadSpan: 2 * 48 * Math.sin(Math.PI / 12), shared: 2, treadSpanMax: null, spanOk: null });
  assert.equal(layoutWinders({ count: 4, innerRadius: 16, width: 42 }).framing.totalLength, 5 * 42);
  assert.match(winderText(layoutWinders({ count: 3, innerRadius: 12 })).join("\n"), /4 radial supports of 36"/);
});
test("winder chord rule is stricter than the arc rule at the edge of passing", () => {
  const arc = checkWinders({ count: 3 }); // zero pivot fails
  assert.equal(layoutWinders({ count: 3 }).ok, false);
  const edge = layoutWinders({ count: 3, innerRadius: arc.minInnerRadius });
  assert.equal(edge.ok, true);
  assert.equal(edge.chordPasses, false); // 6 in of arc is under 6 in of straight edge
});

test("stair hardware: one top connector and one foot anchor per stringer (hand: 36 in wide at 16 in spacing is 3 stringers)", () => {
  const l = layoutStair({ totalRise: 108, tread: 10 }, plan());
  assert.equal(l.hardware.topConnectors, l.stringer.count);
  assert.equal(l.hardware.footAnchors, l.stringer.count);
  const wide = layoutStair({ totalRise: 108, tread: 10, width: 60 }, plan());
  assert.equal(wide.hardware.topConnectors, Math.ceil((60 - 1.5) / 16) + 1);
  assert.match(stairText(l).join("\n"), /Hardware: \d+ top connectors/);
});

test("stringer stock: shortest listed board that holds one stringer (hand: 108 in rise, 10 in tread needs under 192 in)", () => {
  const p = plan();
  const l = layoutStair({ totalRise: 108, tread: 10 }, p);
  const fits = p.stock.filter((x) => x.size === "2x12" && x.length >= l.stringer.length).map((x) => x.length);
  assert.equal(l.stringerStock.length, Math.min(...fits));
  assert.ok(l.stringerStock.length >= l.stringer.length);
  assert.equal(l.stringerStock.count, l.stringer.count);
  assert.match(stairText(l).join("\n"), /Buy \d+ 2x12 boards/);
  assert.equal(layoutStair({ totalRise: 108, tread: 10 }, null).stringerStock, null);
});

test("rail: a bottom space over 6 in earns a sphere note, the default 4 in does not", () => {
  const ok = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1 } }, plan());
  assert.ok(!ok.notes.some((n) => /sphere/.test(n)));
  const bad = layoutStair({ totalRise: 108, tread: 10, rail: { sides: 1, limits: { bottomGap: 7 } } }, plan());
  assert.ok(bad.notes.some((n) => /7 in space.*6 in sphere/.test(n)));
});

test("landing post slenderness: 4x4 reaches 50 x 3.5 = 175 in, 6x6 275 in; a taller post warns", () => {
  const ok = checkPostSlenderness(70);
  assert.ok(ok.ok && ok.maxHeight === 175 && Math.abs(ok.slenderness - 20) < 1e-9);
  const tall = checkPostSlenderness(180);
  assert.ok(!tall.ok); assert.match(tall.warnings[0], /6x6/);
  assert.ok(checkPostSlenderness(180, "6x6").ok);
  assert.equal(checkPostSlenderness(70, "5x5").ok, false);
  const r = layoutStairWithLanding({ totalRise: 160, tread: 10, landing: {} }, plan());
  assert.ok(r.landing.postSlenderness.ok);
  assert.match(landingText(r).join("\n"), /Landing post slenderness \(4x4\)/);
});

test("stringer check matches a hand calculation and flags a thin throat", () => {
  // 2x12, 14 risers of 7.5 in, tread 10: throat 5.25 in; stringers 16 in apart? use the layout's own spacing and run
  const l = layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36, stringerCheck: { liveLoad: 40, deadLoad: 10, Fb: 875, Fv: 135, E: 1300000 } }, plan());
  const k = l.stringerCheck;
  const w = (50 * l.stringer.spacing) / 144, L = l.run, d = 5.25;
  assert.ok(Math.abs(k.M - (w * L * L) / 8) < 1e-6);
  assert.ok(Math.abs(k.fb - ((w * L * L) / 8) / (1.5 * d * d / 6)) < 1e-6);
  assert.ok(Math.abs(k.fv - (1.5 * (w * L / 2)) / (1.5 * d)) < 1e-6);
  assert.ok(k.reaction > 0 && Number.isFinite(k.delta));
  assert.match(stairText(l).join("\n"), /Stringer check/);
  const weak = checkStringer(l, { liveLoad: 40, deadLoad: 10, Fb: 100, Fv: 10, E: 200000 });
  assert.ok(!weak.ok && weak.warnings.length === 3);
});

test("stringer check refuses untyped figures", () => {
  const r = checkStringer({ stringer: { spacing: 16, throat: 5 }, run: 100 }, { liveLoad: 40 });
  assert.ok(!r.ok && r.errors.length >= 3);
});

test("stringer check totals the flight's top reaction and its live share", () => {
  const l = layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36, stringerCheck: { liveLoad: 40, deadLoad: 10, Fb: 875, Fv: 135, E: 1300000 } }, plan());
  const k = l.stringerCheck;
  assert.ok(Math.abs(k.totalReaction - l.stringer.count * k.reaction) < 1e-9);
  assert.ok(Math.abs(k.totalReactionLive - k.totalReaction * 0.8) < 1e-9);
  assert.match(stairText(l).join("\n"), /lb \(\d+ live\) on the header the flight hangs from/);
});

test("linkStairReaction copies the flight's total reaction into the floor's header check, and says why when it cannot", async () => {
  const { linkStairReaction } = await import("./stairs.mjs");
  const { parseLength } = await import("./engine.mjs");
  const sc = { liveLoad: 40, deadLoad: 12, Fb: 900, Fv: 180, E: 1300000 };
  const plan = { ...samplePlan(), floor: { headerCheck: { stairFrom: 0, stairSide: "front" } }, stairs: [{ totalRise: "105", tread: 10, stringer: "2x12", width: 36, stringerCheck: sc }] };
  assert.equal(linkStairReaction(plan, parseLength), null);
  assert.ok(plan.floor.headerCheck.stairReaction > 0 && plan.floor.headerCheck.stairReactionLive <= plan.floor.headerCheck.stairReaction);
  assert.match(linkStairReaction({ floor: { headerCheck: { stairFrom: 1 } }, stairs: [] }, parseLength), /stairFrom 1 needs/);
  assert.equal(linkStairReaction({ floor: {} }, parseLength), null);
});

test("landing post column: NDS Cp by hand (4x4, 60 in, fc 1000, Emin 400000)", () => {
  // slenderness 60/3.5 = 17.14; FcE = 0.822*400000/17.14^2 = 1119.2; ratio 1.1192; a = 2.1192/1.6 = 1.3245
  // Cp = 1.3245 - sqrt(1.3245^2 - 1.1192/0.8) = 1.3245 - sqrt(0.3548) = 0.7288; capacity = 1000*0.7288*12.25 = 8927 lb
  const r = checkLandingPostColumn(60, "4x4", 500, { fc: 1000, emin: 400000 });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.cp - 0.7288) < 0.002, String(r.cp));
  assert.ok(Math.abs(r.capacity - 8927) < 30, String(r.capacity));
  assert.ok(r.passes);
  assert.equal(checkLandingPostColumn(60, "4x4", 9500, { fc: 1000, emin: 400000 }).passes, false);
  assert.equal(checkLandingPostColumn(60, "4x4", 5, { fc: 10, emin: 400000 }).ok, false);
});

test("landing with typed postFc/postEmin carries a column check and prints it", () => {
  const l = layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, postSpacing: 60, soilBearing: 1500, postFc: 1000, postEmin: 400000 } }, plan());
  assert.ok(l.ok);
  assert.ok(l.landing.postColumn.ok);
  assert.ok(landingText(l).some((x) => x.includes("Landing post column")));
  const bad = layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, postFc: 1000, postEmin: 400000 } }, plan());
  assert.equal(bad.landing.postColumn.ok, false);
});

test("winder walkline uniformity: 12 in out at hand figures", () => {
  // 3 treads of 30 deg, inner radius 20: walk = (20+12)*pi/6 = 16.755 in. Against a 10 in straight tread: off by 6.755, fails.
  const bad = checkWinders({ count: 3, innerRadius: 20, straightTread: 10 });
  assert.equal(bad.ok, false);
  assert.ok(Math.abs(bad.uniformDiff - (32 * Math.PI / 6 - 10)) < 1e-9);
  assert.match(winderText(bad).join("\n"), /differs from the 10 in straight tread/);
  // radius 0 with 2 treads of 45 deg gives walk 12*pi/4 = 9.425; straight tread 9.5 is within 3/8 on uniformity (other rules fail separately)
  const near = checkWinders({ count: 2, innerRadius: 0, straightTread: 9.5 });
  assert.ok(Math.abs(near.uniformDiff - (12 * Math.PI / 4 - 9.5)) < 1e-9);
  assert.ok(!near.problems.some((p) => /straight tread/.test(p)));
  // untyped tread: not checked
  assert.equal(checkWinders({ count: 3, innerRadius: 12 }).uniformDiff, null);
});

test("winder tread span is the widest gap between two radial supports, checked against the tread table when thickness is typed", () => {
  // hand: 30 degree treads, outer radius 12 + 36 = 48 in, gap 2 x 48 x sin 15 = 24.85 in
  const f = layoutWinders({ count: 3, innerRadius: 12, treadThickness: 1.5 }).framing;
  assert.ok(Math.abs(f.treadSpan - 24.8467) < 1e-3);
  assert.equal(f.treadSpanMax, 24); assert.equal(f.spanOk, false);
  assert.match(winderText(layoutWinders({ count: 3, innerRadius: 12, treadThickness: 1.5 })).join("\n"), /Over the 24" most/);
  assert.equal(layoutWinders({ count: 4, innerRadius: 12, treadThickness: 1.5 }).framing.spanOk, true); // 22.5 deg: 2 x 48 x sin 11.25 = 18.7
});

test("bad stringer spacing, nosing and landing dimensions are refused (2026-10-31)", async () => {
  const S = await import("./stairs.mjs");
  assert.equal(S.layoutStair({ totalRise: 108, stringerSpacing: 0 }).ok, false);
  assert.equal(S.layoutStair({ totalRise: 108, nosing: -5 }).ok, false);
  assert.throws(() => S.layoutLandingPosts(36, 36, 40, 0), RangeError);
  assert.throws(() => S.layoutLandingPosts(NaN, 36, 40), RangeError);
  assert.equal(S.sizeLandingFootings(-36, 36, 96, { soilBearing: 1500 }).ok, false);
  assert.equal(S.layoutStair({ totalRise: 108 }).ok, true);
});

test("landing joist check by hand (2x8, 120 in span, 16 in o.c., 40 live + 10 dead)", () => {
  // w = 50*16/144 = 5.5556 lb/in; M = w L^2/8 = 10000 lb-in; V = 333.33 lb; S = 1.5*7.25^2/6 = 13.1406 in^3
  // fb = 761 psi; fv = 1.5*333.33/(1.5*7.25) = 45.98 psi; wl = 4.4444; I = 1.5*7.25^3/12 = 47.634
  // delta = 5*4.4444*120^4/(384*1.4e6*47.634) = 0.18 in vs L/360 = 0.333 in
  const r = checkLandingJoists({ size: "2x8", spacing: 16, span: 120 }, { deadPsf: 10, livePsf: 40, Fb: 900, Fv: 135, E: 1400000 });
  assert.ok(Math.abs(r.fb - 761) < 1, String(r.fb));
  assert.ok(Math.abs(r.fv - 45.98) < 0.05, String(r.fv));
  assert.ok(Math.abs(r.delta - 0.18) < 0.005, String(r.delta));
  assert.ok(r.ok);
  const weak = checkLandingJoists({ size: "2x8", spacing: 16, span: 120 }, { deadPsf: 10, livePsf: 40, Fb: 700, Fv: 135, E: 1400000 });
  assert.equal(weak.ok, false);
  assert.equal(checkLandingJoists({ size: "2x8", spacing: 16, span: 120 }, { deadPsf: 10, livePsf: 40, Fb: 5, Fv: 135, E: 1400000 }).ok, false);
});

test("flights' stringer reactions add to the heaviest landing post", () => {
  // single bay along (width 48 < 96): corner post takes half of the larger flight reaction
  assert.equal(flightPostLoad({ stringerCheck: { totalReaction: 600 } }, { stringerCheck: { totalReaction: 800 } }, 48, 96), 400);
  // width 120 at 60 in spacing: 2 bays, a mid-edge post takes a full bay: R / 2
  assert.equal(flightPostLoad({ stringerCheck: { totalReaction: 600 } }, null, 120, 60), 300);
  assert.equal(flightPostLoad({}, {}, 48, 96), 0);
  const sc = { liveLoad: 40, deadLoad: 10, Fb: 900, Fv: 135, E: 1400000 };
  const base = layoutStairWithLanding({ totalRise: 160, width: 48, landing: { depth: 120, soilBearing: 1500 } }, plan());
  const withR = layoutStairWithLanding({ totalRise: 160, width: 48, stringerCheck: sc, landing: { depth: 120, soilBearing: 1500, joistCheck: { deadPsf: 10, livePsf: 40, Fb: 900, Fv: 135, E: 1400000 } } }, plan());
  assert.ok(withR.ok, JSON.stringify(withR.errors));
  assert.ok(withR.landing.footings.load > base.landing.footings.load);
  assert.ok(withR.landing.footings.extraLoad > 0);
  assert.ok(withR.landing.joistCheck.fb > 0);
  assert.ok(landingText(withR).some((x) => x.includes("Landing joist check")));
});

test("tread check: hand arithmetic for a 2x12 tread on 16 in spans, and refusals", () => {
  // 1.5 x 11.25 board, 16 in span, 300 lb: M = 1200 in-lb, S = 11.25*1.5^2/6 = 4.21875, fb = 284.44 psi
  // I = 11.25*1.5^3/12 = 3.1640625; delta = 300*4096/(48*1.3e6*3.1640625) = 0.006223 in; limit 16/240 = 0.0667 in
  const k = checkTread({ span: 16, thickness: 1.5, width: 11.25 }, { point: 300, Fb: 875, E: 1300000 });
  assert.ok(k.ok && Math.abs(k.fb - 284.444) < 1e-2 && Math.abs(k.delta - 0.006223) < 1e-5 && Math.abs(k.limit - 16 / 240) < 1e-9);
  // 1 in thick, 5.5 in wide decking at 16 in: S = 0.91667, fb = 1309 psi > 1000
  const w = checkTread({ span: 16, thickness: 1, width: 5.5 }, { point: 300, Fb: 1000, E: 1200000 });
  assert.ok(!w.ok && Math.abs(w.fb - 1309.09) < 0.01 && w.warnings.length >= 1);
  const r = checkTread({ span: 16, thickness: 1.5, width: 11.25 }, { point: 300 });
  assert.ok(!r.ok && r.errors.length === 2);
});

test("tread check runs from the stair input and prints", () => {
  const l = layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36, treadCheck: { point: 300, Fb: 875, E: 1300000 } }, plan());
  assert.ok(l.treadCheck.ok);
  assert.match(stairText(l).join("\n"), /Tread check/);
  assert.equal(layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36 }, plan()).treadCheck, null);
});

test("guard post check: hand arithmetic for a 4x4 post at 36 in, and refusals", () => {
  // 3.5 x 3.5 post, 200 lb at 36 in: M = 7200 in-lb, S = 3.5^3/6 = 7.1458, fb = 1007.6 psi
  const k = checkGuardPost({ width: 3.5, depth: 3.5, height: 36 }, { point: 200, Fb: 1200 });
  assert.ok(k.ok && Math.abs(k.fb - 1007.58) < 0.01);
  // a 2x4 on edge-wise weak axis: 1.5 x 3.5, S = 3.5*1.5^2/6 = 1.3125, fb = 5485.7
  const w = checkGuardPost({ width: 1.5, depth: 3.5, height: 36 }, { point: 200, Fb: 1200 });
  assert.ok(!w.ok && Math.abs(w.fb - 5485.71) < 0.01 && w.warnings.length === 1);
  assert.ok(!checkGuardPost({ width: 3.5, depth: 3.5, height: 36 }, { point: 200 }).ok);
});

test("guard post check runs from the stair input and prints", () => {
  const l = layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36, rail: { sides: 1 }, postCheck: { point: 200, Fb: 1200 } }, plan());
  assert.ok(l.postCheck.ok);
  assert.match(stairText(l).join("\n"), /Guard post check/);
  assert.equal(layoutStair({ totalRise: 105, tread: 10, stringer: "2x12", width: 36, rail: { sides: 1 } }, plan()).postCheck, null);
});

test("stringer top connection: connectors per stringer from the end reaction", () => {
  const base = { stringer: { spacing: 16, throat: 5, count: 3 }, run: 100 };
  const c = { liveLoad: 40, deadLoad: 10, Fb: 1200, Fv: 180, E: 1400000 };
  // w = 50*16/144 = 5.5556 lb/in, V = w*100/2 = 277.8 lb
  const none = checkStringer(base, c);
  assert.equal(none.connectorsNeeded, null);
  assert.equal(checkStringer(base, { ...c, connectorCapacity: 300 }).connectorsNeeded, 1);
  assert.equal(checkStringer(base, { ...c, connectorCapacity: 100 }).connectorsNeeded, 3);
  assert.ok(checkStringer(base, { ...c, connectorCapacity: 5 }).errors.length === 1);
});
