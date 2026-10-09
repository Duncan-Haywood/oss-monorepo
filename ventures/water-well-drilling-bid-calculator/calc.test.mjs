import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, drilling, wellCost, priceFor, outcome, depthLadder, dryRiskLadder, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: 100 ft, 20 ft of overburden, nothing but drilling.
const bare = { ...DEFAULTS, depthFt: 100, overburdenFt: 20, overburdenCostFt: 5, rockCostFt: 10, overburdenFtPerHour: 20, rockFtPerHour: 10,
  setupHours: 2, rigRate: 100, casingFt: 0, casingCostFt: 0, groutFt: 0, groutCostFt: 0, pitlessCost: 0, pumpCost: 0, tankCost: 0,
  pumpInstallHours: 0, trenchFt: 0, permitTest: 0, mobilization: 0, dryHolePct: 0, dryRecoverPct: 0, abandonCost: 0, overheadPct: 0, marginPct: 50 };

test("drilling splits consumables and rig hours by formation", () => {
  const d = drilling(bare);
  near(d.over, 20);
  near(d.rock, 80);
  near(d.consumables, 20 * 5 + 80 * 10);   // 900
  near(d.driveHours, 1 + 8);
  near(d.rigHours, 11);
  near(d.rig, 1100);
  near(d.cost, 2000);
});

test("price earns the target margin on the price", () => {
  const c = wellCost(bare);
  const price = priceFor(bare, c);
  near(price, 4000);
  near(outcome(bare, c, price).margin, 50);
  near(outcome(bare, c, price).perFoot, 40);
});

test("overhead applies to direct cost, not to the dry-hole allowance", () => {
  const o = { ...bare, overheadPct: 10, dryHolePct: 10, mobilization: 500 };
  const c = wellCost(o);
  near(c.direct, 2500);
  near(c.overhead, 250);
  near(c.dryHoleCost, 2500);            // drilling + mobilization
  near(c.allowance, 250);
  near(c.cost, 3000);
});

test("a dry hole costs drilling, casing, the move, permit and sealing, less what the contract recovers", () => {
  const o = { ...bare, casingFt: 50, casingCostFt: 10, mobilization: 400, permitTest: 100, abandonCost: 300, dryRecoverPct: 25 };
  const c = wellCost(o);
  near(c.dryHoleCost, 2000 + 500 + 400 + 100 + 300);
  near(c.dryHoleLoss, 3300 * 0.75);
});

test("the dry-hole allowance is chance times net loss and raises the price", () => {
  const lo = wellCost({ ...bare, dryHolePct: 0 });
  const hi = wellCost({ ...bare, dryHolePct: 10 });
  near(hi.allowance, 200);
  near(hi.cost - lo.cost, 200);
  assert.ok(priceFor(bare, hi) > priceFor(bare, lo));
});

test("overburden deeper than the hole is capped", () => {
  const d = drilling({ ...bare, overburdenFt: 500 });
  near(d.over, 100);
  near(d.rock, 0);
});

test("pump system and trench add to cost", () => {
  const o = { ...bare, pitlessCost: 100, pumpCost: 1000, tankCost: 400, pumpInstallHours: 2, installRate: 50, trenchFt: 50, trenchCostFt: 8 };
  const c = wellCost(o);
  near(c.pumpSystem, 1600);
  near(c.trench, 400);
  near(c.direct, 2000 + 1600 + 400);
});

test("deeper holes cost more per job but the fixed items fall per foot", () => {
  const rows = depthLadder(DEFAULTS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price > rows[i - 1].price);
  // Fixed items (move, pump, trench) spread over more feet, so a shallow well costs more per foot than a deep one.
  assert.ok(rows[0].perFoot > rows[rows.length - 1].perFoot);
});

test("dry risk ladder rises with the chance", () => {
  const rows = dryRiskLadder(DEFAULTS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price > rows[i - 1].price);
  near(rows[0].allowance, 0);
});

test("analyze reports break-even, dry-hole cost and wells needed to cover it", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.result.price > a.result.breakEven);
  assert.ok(a.result.breakEven > a.result.breakEvenIfGood);
  assert.ok(a.result.cost.dryHoleCost > 0);
  assert.ok(a.result.wellsToCoverDry > 0 && Number.isFinite(a.result.wellsToCoverDry));
  near(a.result.atPrice.margin, DEFAULTS.marginPct);
});

test("bad input is refused, not priced", () => {
  assert.equal(analyze({ depthFt: 0 }).result, null);
  assert.equal(analyze({ marginPct: 100 }).result, null);
  assert.equal(analyze({ dryHolePct: 150 }).result, null);
  assert.ok(analyze({ depthFt: -5 }).warnings.length > 0);
});

test("zero dry-hole chance warns that a dry hole comes out of margin", () => {
  assert.ok(analyze({ dryHolePct: 0 }).warnings.some((w) => /dry hole/i.test(w)));
});

test("num parses money and percent strings and rejects blanks", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("12%"), 12);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(1234.4), "$1,234");
  assert.equal(pct(12.34), "12.3%");
});

test("csv has both tables", () => {
  const csv = toCsv(analyze(DEFAULTS));
  assert.match(csv, /^depth_ft,price/);
  assert.match(csv, /dry_hole_chance_pct/);
  assert.equal(toCsv(analyze({ depthFt: 0 })), "");
});
