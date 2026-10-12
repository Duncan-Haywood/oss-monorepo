import { test } from "node:test";
import assert from "node:assert/strict";
import { readSettings, readShows, parseDeal, venuePay, showProfit, drawFor, askFor, planTour, planFromFields, validatePlan, planCsv, planText, sampleFields, verdict } from "./calc.mjs";

const S = readSettings({}).settings;

test("deal parsing", () => {
  assert.deepEqual(parseDeal(["flat", "400"]), { kind: "flat", guarantee: 400, pct: 0, expenses: 0 });
  assert.deepEqual(parseDeal(["door", "80", "600"]), { kind: "door", guarantee: 0, pct: 80, expenses: 600 });
  assert.deepEqual(parseDeal(["vs", "$400", "80%", "600"]), { kind: "vs", guarantee: 400, pct: 80, expenses: 600 });
  assert.equal(parseDeal(["door", "150"]), null);
  assert.equal(parseDeal(["wat", "1"]), null);
  assert.equal(parseDeal(["flat"]), null);
});

test("venue pay: flat, door, versus", () => {
  assert.equal(venuePay({ kind: "flat", guarantee: 400, pct: 0, expenses: 0 }, 1000, 20), 400);
  const door = { kind: "door", guarantee: 0, pct: 80, expenses: 600 };
  assert.equal(venuePay(door, 100, 15), 720); // 80% of 1500-600
  assert.equal(venuePay(door, 10, 15), 0); // below expenses pays nothing
  const vs = { kind: "vs", guarantee: 500, pct: 80, expenses: 600 };
  assert.equal(venuePay(vs, 10, 15), 500);
  assert.equal(venuePay(vs, 200, 15), 1920);
});

test("show profit arithmetic is exact on a hand-worked case", () => {
  const { shows } = readShows("A: miles 100; draw 50; ticket 10; deal flat 300; merch 4; nights 1; other 20");
  const s = readSettings({ members: 3, crew: 1, costPerMile: 0.5, roomCost: 100, occupancy: 2, perDiem: 10, merchCogsPct: 40, merchCutPct: 10, agentPct: 10, crewPerShow: 25 }).settings;
  const p = showProfit(shows[0], s);
  assert.equal(p.fee, 300);
  assert.equal(p.agent, 30);
  assert.equal(p.merchNet, 200 * 0.5); // 50 heads * $4 = 200 gross, minus 10% cut and 40% cogs
  assert.equal(p.drive, 50);
  assert.equal(p.lodging, 200); // 4 people -> 2 rooms
  assert.equal(p.perDiem, 40);
  assert.equal(p.crew, 25);
  assert.equal(p.profit, 300 - 30 + 100 - (50 + 200 + 40 + 25 + 20));
  assert.equal(p.contribution, p.profit + 50);
});

test("break-even draw is the smallest draw with profit >= 0 and monotone", () => {
  const { shows } = readShows("B: miles 300; ticket 12; deal door 70 300; merch 3; nights 1");
  const d = drawFor(shows[0], S, 0);
  assert.ok(d > 0);
  assert.ok(showProfit(shows[0], S, d).profit >= 0);
  assert.ok(showProfit(shows[0], S, d - 1).profit < 0);
  let prev = -Infinity;
  for (let x = 0; x <= 300; x += 10) { const v = showProfit(shows[0], S, x).profit; assert.ok(v >= prev); prev = v; }
});

test("a show that can never break even reports null, a free one reports 0", () => {
  const { shows } = readShows("C: miles 900; ticket 0; deal door 70 0; nights 3\nD: deal flat 500");
  assert.equal(drawFor(shows[0], S, 0), null);
  assert.equal(drawFor(shows[1], S, 0), 0);
});

test("ask hits the target exactly for a flat deal", () => {
  const { shows } = readShows("E: miles 200; draw 60; ticket 10; deal flat 200; merch 4; nights 1");
  const ask = askFor(shows[0], S, 250);
  const raised = { ...shows[0], deal: { ...shows[0].deal, guarantee: ask } };
  assert.ok(Math.abs(showProfit(raised, S).profit - 250) < 0.01);
});

test("verdicts split keep / on-the-way / drop", () => {
  assert.equal(verdict({ profit: 5, contribution: 9 }), "keep");
  assert.equal(verdict({ profit: -5, contribution: 20 }), "on-the-way");
  assert.equal(verdict({ profit: -50, contribution: -10 }), "drop");
});

test("the sample tour validates and totals add up", () => {
  const { errors, plan } = planFromFields(sampleFields());
  assert.deepEqual(errors, []);
  assert.equal(plan.rows.length, 5);
  assert.equal(validatePlan(plan).ok, true);
  const sum = plan.rows.reduce((a, r) => a + r.profit, 0) - 250;
  assert.ok(Math.abs(sum - plan.net) < 0.01);
  assert.ok(plan.rows.some((r) => r.verdict !== "keep"), "the sample should show a weak date");
  assert.match(planCsv(plan), /TOTAL/);
  assert.match(planText(plan), /Tour net/);
});

test("input errors are specific and nothing is planned", () => {
  assert.ok(readShows("no colon here").errors[0].includes("colon"));
  assert.ok(readShows("X: mils 5").errors[0].includes("unknown field"));
  assert.ok(readShows("X: deal vs 5").errors[0].includes("deal must be"));
  assert.ok(readShows("X: draw -3").errors[0].includes("0 or more"));
  assert.ok(readShows("").errors.length);
  assert.ok(readSettings({ members: "0" }).errors.length);
  assert.ok(readSettings({ merchCogsPct: 70, merchCutPct: 40 }).errors.length);
  assert.equal(planFromFields({ ...sampleFields(), members: "abc" }).plan, null);
});

test("sensitivity rows move with the draw", () => {
  const { plan } = planFromFields(sampleFields());
  for (const r of plan.rows) assert.ok(r.sens[3].profit >= r.sens[0].profit);
});
