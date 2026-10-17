import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseGames, SAMPLE, summaryText, sweepCsv, WEEKS_PER_MONTH } from "./calc.mjs";

const base = { creditValue: "0.25", prizePerTicket: "0.004", feesPct: "3", rentPerSqft: "24", energyMonthly: "25", maintPct: "8", targetPaybackMonths: "18", defaultSqft: "12", maxPayoutPct: "", games: "Roller, 4000, 4, 250, 10, 12" };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("one game: revenue, fees, prizes, fixed cost and profit match the hand calculation", () => {
  const r = compute(base).rows[0];
  close(r.revenue, 250);              // 250 plays x 4 credits x 0.25
  close(r.fees, 7.5);                 // 3%
  close(r.prize, 10);                 // 250 x 10 tickets x 0.004
  close(r.rent, 288 / 52);            // 12 sq ft x 24 / 52
  close(r.energy, 25 / WEEKS_PER_MONTH);
  close(r.maint, 320 / 52);           // 4000 x 8% / 52
  close(r.net, 232.5 - (288 + 320) / 52 - 25 * 12 / 52);
  close(r.paybackWeeks, 4000 / r.net);
});

test("break-even plays and plays needed for the target payback satisfy their own definitions", () => {
  const r = compute(base).rows[0];
  close(r.perPlay, 4 * 0.25 * 0.97 - 10 * 0.004);
  close(r.breakEvenPlays * r.perPlay, r.fixed);
  const needNet = 4000 / (18 * WEEKS_PER_MONTH);
  close(r.needPlays * r.perPlay - r.fixed, needNet);
});

test("verdicts: keep inside target, watch beyond it, cut at a loss", () => {
  const games = ["Fast, 4000, 4, 250, 10, 12", "Slow, 9000, 2, 140, 0, 30", "Loser, 5000, 1, 10, 30, 20"].join("\n");
  const r = compute({ ...base, games });
  assert.deepEqual(r.rows.map((x) => x.verdict), ["keep", "watch", "cut"]);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Loser/.test(f.title)));
  assert.ok(r.findings.some((f) => f.severity === "medium" && /Slow/.test(f.title)));
  assert.ok(r.rows[2].breakEvenPlays > 10); // positive margin per play, but 10 plays a week cannot carry the floor
});

test("a game whose every play loses money has no break-even point", () => {
  const r = compute({ ...base, games: "Giveaway, 3000, 1, 100, 100, 10" });
  assert.equal(r.rows[0].breakEvenPlays, null);
  assert.equal(r.rows[0].verdict, "cut");
  assert.equal(r.rows[0].paybackWeeks, null);
});

test("totals add up and the price sweep is monotone", () => {
  const r = compute({ ...base, games: SAMPLE.games });
  close(r.totals.net, r.rows.reduce((a, x) => a + x.net, 0));
  close(r.totals.revenue, r.rows.reduce((a, x) => a + x.revenue, 0));
  const nets = r.priceSweep.map((x) => x.net);
  for (let k = 1; k < nets.length; k++) assert.ok(nets[k] > nets[k - 1]);
  const zero = r.priceSweep.find((x) => x.pct === 0);
  close(zero.net, r.totals.net);
  const prize = r.prizeSweep.map((x) => x.net);
  for (let k = 1; k < prize.length; k++) assert.ok(prize[k] < prize[k - 1]);
});

test("the prize-limit finding fires only above the limit and names the tickets that meet it", () => {
  const over = compute({ ...base, maxPayoutPct: "3" });
  const f = over.findings.find((x) => /prizes, above/.test(x.title));
  assert.ok(f);
  // 4% of revenue is spent; the 3% limit allows 3% x 1.00 credit-dollars / 0.004 = 7.5 tickets
  assert.match(f.title, /7\.5\./);
  assert.ok(!compute({ ...base, maxPayoutPct: "8" }).findings.some((x) => /prizes, above/.test(x.title)));
});

test("bad input is rejected with a reason rather than clamped", () => {
  assert.match(compute({ ...base, creditValue: "" }).errors[0], /one credit earns/);
  assert.match(compute({ ...base, feesPct: "40" }).errors[0], /fees/);
  assert.match(compute({ ...base, games: "" }).errors[0], /at least one game/);
  assert.match(compute({ ...base, games: "Only name, 100" }).errors[0], /Line 1/);
  assert.match(compute({ ...base, games: "X, -5, 1, 10, 0" }).errors[0], /game cost/);
  assert.match(compute({ ...base, games: "X, 100, 1, abc, 0" }).errors[0], /plays per week/);
  assert.match(compute({ ...base, games: "X, 100, 1, 10, 0, 900" }).errors[0], /square feet/);
});

test("games parse with tabs, blank lines and a default footprint", () => {
  const { games, errors } = parseGames("A\t100\t1\t10\t0\n\nB, 200, 2, 20, 5, 30", 12);
  assert.deepEqual(errors, []);
  assert.equal(games[0].sqft, 12);
  assert.equal(games[1].sqft, 30);
});

test("the shipped example computes, and summary and CSV render it", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 6);
  assert.match(summaryText(r), /ARCADE GAME PAYBACK SUMMARY/);
  const csv = sweepCsv(r).trim().split("\n");
  assert.equal(csv.length, 7);
});

test("CSV cells that start like a formula are neutralised", () => {
  const r = compute({ ...base, games: "=cmd|x, 4000, 4, 250, 10, 12" });
  assert.match(sweepCsv(r), /"'=cmd\|x"/);
});
