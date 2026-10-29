import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan, formatLength } from "./engine.mjs";
import { layoutStair, stairCuts, stairText, sampleStair, validateStair, layoutStairWithLanding, landingCuts, landingText } from "./stairs.mjs";
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
  assert.equal(g.posts.count, 4); // one segment per edge, 2 posts each
  assert.ok(g.balusters.maxGap <= 4 + 1e-9);
  // hand check, 36 in edge: clear 32.5, ceil((32.5-4)/5.5)=6 balusters, gap (32.5-9)/7 = 3.357
  assert.equal(g.balusters.count, 12);
  assert.ok(Math.abs(g.balusters.length - 29) < 1e-9); // 36 - 2x1.5 rails - 4 bottom gap
  assert.equal(landingCuts(r).filter((c) => c.kind === "landing guard rail").length, 2);
  assert.ok(landingText(r).some((t) => /Landing guard/.test(t)));
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
