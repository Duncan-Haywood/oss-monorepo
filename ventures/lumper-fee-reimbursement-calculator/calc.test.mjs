import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoutes, routeCost, dockCost, plan, sensitivity, sampleInput, toCsv } from "./calc.mjs";

test("parseRoutes reads lines, skips comments and reports bad lines", () => {
  const { routes, errors } = parseRoutes("# note\nA, 5, 2, 100, 0, 10\n\nB,,,50");
  assert.equal(errors.length, 0);
  assert.deepEqual(routes[0], { name: "A", flat: 5, feePct: 2, refundPct: 100, cap: 0, days: 10 });
  assert.deepEqual(routes[1], { name: "B", flat: 0, feePct: 0, refundPct: 50, cap: 0, days: 0 });
  assert.match(parseRoutes("A, x, 0, 100").errors[0], /plain numbers/);
  assert.match(parseRoutes("A, 0, 0, 120").errors[0], /between 0 and 100/);
  assert.match(parseRoutes("A").errors[0], /need/);
  assert.match(parseRoutes("A, -1, 0, 100").errors[0], /negative/);
});

test("a fully refunded lumper with a percent fee leaves exactly the fee", () => {
  const c = routeCost({ name: "x", flat: 0, feePct: 3, refundPct: 100, cap: 0, days: 0 }, { lumper: 200, apr: 0 });
  assert.equal(c.fee, 6);
  assert.equal(c.cashOut, 206);
  assert.equal(c.refunded, 200);
  assert.equal(c.net, 6);
  assert.equal(c.makeWhole, 206);
});

test("the cap limits the refund and financing adds the cost of waiting", () => {
  const c = routeCost({ name: "x", flat: 0, feePct: 0, refundPct: 100, cap: 150, days: 30 }, { lumper: 200, apr: 24 });
  assert.equal(c.refunded, 150);
  assert.equal(c.financing, round(200 * 0.24 * 30 / 365));
  assert.equal(c.net, round(50 + 200 * 0.24 * 30 / 365));
});
function round(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

test("dock cost pays detention only past the free hours", () => {
  assert.deepEqual(dockCost({ waitHours: 4.5, freeHours: 2, detentionRate: 40, hourlyValue: 35 }), { paidHours: 2.5, detentionPaid: 100, timeCost: 157.5, net: 57.5 });
  assert.equal(dockCost({ waitHours: 1, freeHours: 2, detentionRate: 40, hourlyValue: 35 }).detentionPaid, 0);
});

test("plan ranks routes on the sample and totals the dock", () => {
  const r = plan(sampleInput());
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 3);
  assert.equal(r.best.name, "Broker advance code");
  assert.equal(r.best.net, 5.25);
  assert.equal(r.worst.name, "Cash and hope after a short-pay");
  assert.equal(r.rows[0].total, round(5.25 + 57.5));
  assert.equal(r.rows[0].yearly, round((5.25 + 57.5) * 72));
  assert.ok(r.advice.length >= 3);
});

test("plan reports input errors in plain words", () => {
  assert.match(plan({ ...sampleInput(), lumper: "0" }).error, /lumper fee/);
  assert.match(plan({ ...sampleInput(), apr: "-1" }).error, /apr/);
  assert.match(plan({ ...sampleInput(), routes: "" }).error, /at least one/);
  assert.match(plan({ ...sampleInput(), routes: "A, 0, 0" }).error, /need/);
});

test("sensitivity scales the lumper and csv has a row per route", () => {
  const s = sensitivity(sampleInput());
  assert.equal(s.length, 6);
  assert.equal(s[2].lumper, 175);
  assert.ok(s[5].net > s[0].net);
  const csv = toCsv(plan(sampleInput()));
  assert.equal(csv.split("\n").length, 4);
});
