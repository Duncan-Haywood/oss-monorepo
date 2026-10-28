import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { layoutStair, stairCuts, stairText, sampleStair, validateStair } from "./stairs.mjs";

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
