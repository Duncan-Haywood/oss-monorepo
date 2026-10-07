import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHistory, summarize, fitElasticity, demandAt, priceScenarios, recommend, pacing, lastMinute, packages, diagnose, DEFAULT_ELASTICITY, num } from "./calc.mjs";

const rows = (xs) => xs.map(([offered, sold, price], i) => ({ label: `r${i}`, offered, sold, price }));

test("parseHistory reads tabs, commas, a header and money formatting", () => {
  const { rows: r, errors } = parseHistory("label,offered,sold,price\nMay 1,3,2,\"$1,200\"\nMay 8\t3\t3\t1200");
  assert.equal(errors.length, 0);
  assert.equal(r.length, 2);
  assert.equal(r[0].price, 1200);
  assert.equal(r[1].sold, 3);
});

test("parseHistory reports bad lines instead of guessing", () => {
  const { rows: r, errors } = parseHistory("A,3,5,100\nB,0,0,100\nC,3,1,-5\nD,3");
  assert.equal(r.length, 0);
  assert.equal(errors.length, 4);
});

test("summarize totals sell-through, revenue and unsold value", () => {
  const s = summarize(rows([[4, 4, 100], [4, 2, 100], [4, 0, 100]]));
  assert.equal(s.rate, 0.5);
  assert.equal(s.revenue, 600);
  assert.equal(s.capacity, 1200);
  assert.equal(s.unsold, 600);
  assert.equal(s.soldOutRuns, 1);
  assert.equal(s.emptyRuns, 1);
  assert.equal(summarize([]), null);
});

test("trend compares the latest runs with the ones before", () => {
  const s = summarize(rows([[4, 4, 1], [4, 4, 1], [4, 4, 1], [4, 4, 1], [4, 1, 1], [4, 1, 1], [4, 1, 1], [4, 1, 1]]));
  assert.ok(Math.abs(s.trend - -0.75) < 1e-9);
  assert.equal(summarize(rows([[4, 4, 1]])).trend, null);
});

test("fitElasticity recovers a known response and ignores censored runs", () => {
  const data = [];
  for (const p of [100, 125, 150, 200, 250]) data.push([10, Math.round(10 * 0.8 * Math.pow(p / 100, -1.5)), p]);
  data.push([10, 10, 80], [10, 0, 400]);
  const fit = fitElasticity(rows(data));
  assert.equal(fit.source, "fitted");
  assert.ok(fit.e < -1 && fit.e > -2, `e=${fit.e}`);
  assert.equal(fit.used, 5);
});

test("fitElasticity falls back when there is no price variation or the sign is wrong", () => {
  assert.equal(fitElasticity(rows([[10, 5, 100], [10, 6, 100], [10, 4, 100], [10, 5, 100]])).source, "assumed");
  const up = fitElasticity(rows([[10, 2, 100], [10, 4, 150], [10, 6, 200], [10, 8, 250]]));
  assert.equal(up.source, "assumed");
  assert.equal(up.e, DEFAULT_ELASTICITY);
});

test("demand falls with price, caps at one, and a sold-out anchor assumes extra demand", () => {
  assert.ok(demandAt(120, 100, 0.6, -1.2) < 0.6);
  assert.equal(demandAt(10, 100, 0.9, -1.2), 1);
  assert.ok(demandAt(110, 100, 1, -1.2) > 0.9);
  assert.equal(demandAt(0, 100, 0.5, -1), 0);
});

test("a sold-out product is told to raise; a weak one to lower", () => {
  const hi = recommend({ price: 100, slots: 4, anchorRate: 1, e: -1.2 });
  assert.equal(hi.direction, "raise");
  assert.ok(hi.price <= 125.0001);
  assert.ok(hi.gain > 0);
  const lo = recommend({ price: 100, slots: 4, anchorRate: 0.3, e: -1.8 });
  assert.equal(lo.direction, "lower");
  assert.ok(lo.price >= 74.99);
  assert.equal(recommend({ price: 0, slots: 4, anchorRate: 1, e: -1 }), null);
});

test("priceScenarios gives seven rows centred on today's price", () => {
  const sc = priceScenarios({ price: 200, slots: 3, anchorRate: 0.7, e: -1.2, runsPerMonth: 4 });
  assert.equal(sc.length, 7);
  assert.equal(sc[3].price, 200);
  assert.ok(Math.abs(sc[3].perMonth - 200 * 3 * 0.7 * 4) < 1e-6);
});

test("pacing projects the final fill from the booking curve", () => {
  const p = pacing({ slots: 4, soldNow: 1, daysOut: 14, typicalFinalRate: 0.9 });
  assert.ok(Math.abs(p.share - 0.6) < 1e-9);
  assert.ok(Math.abs(p.projected - 1 / 0.6) < 1e-9);
  assert.equal(p.status, "behind");
  assert.equal(pacing({ slots: 4, soldNow: 4, daysOut: 7, typicalFinalRate: 0.5 }).status, "ahead");
  assert.equal(pacing({ slots: 4, soldNow: 4, daysOut: 7 }).status, "unknown");
  assert.equal(pacing({ slots: 0, soldNow: 0, daysOut: 7 }), null);
});

test("pacing interpolates between curve points and caps projection at capacity", () => {
  assert.ok(Math.abs(pacing({ slots: 4, soldNow: 1, daysOut: 10.5 }).share - 0.7) < 1e-9);
  assert.equal(pacing({ slots: 4, soldNow: 4, daysOut: 14 }).projected, 4);
  assert.equal(pacing({ slots: 4, soldNow: 0, daysOut: 60 }).projected, 0);
});

test("lastMinute and packages do plain arithmetic", () => {
  const lm = lastMinute({ unsold: 2, price: 500, floorPct: 0.5, fillChance: 0.5 });
  assert.equal(lm.floor, 250);
  assert.equal(lm.expected, 250);
  assert.equal(lm.erosionPerSlot, 250);
  const pk = packages({ price: 500, tiers: [{ runs: 3, discount: 0.1 }, { runs: 0, discount: 0.2 }] });
  assert.equal(pk.length, 1);
  assert.equal(pk[0].each, 450);
  assert.equal(pk[0].committed, 1350);
  assert.equal(pk[0].vsList, 150);
});

test("diagnose orders findings and flags a falling trend", () => {
  const s = summarize(rows([[4, 4, 100], [4, 4, 100], [4, 3, 100], [4, 3, 100], [4, 1, 100], [4, 1, 100], [4, 1, 100], [4, 0, 100]]));
  const fit = fitElasticity(rows([[4, 1, 100]]));
  const out = diagnose({ summary: s, fit, rec: recommend({ price: 100, slots: 4, anchorRate: s.rate, e: fit.e }), pace: null });
  assert.ok(out.some((f) => /falling/.test(f.title)));
  assert.ok(out.some((f) => /assumed/.test(f.title)));
  assert.deepEqual(diagnose({ summary: null }), []);
});

test("num strips currency formatting and rejects junk", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.ok(Number.isNaN(num("abc")));
});
