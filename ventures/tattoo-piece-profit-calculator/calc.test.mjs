import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePieces, analyze, sampleJob, reportCsv, money, money2 } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const base = { ownerHourly: 50, cardFeePct: 0 };
const one = (txt) => parsePieces(txt).rows;

test("parser reads lines, defaults sessions to 1, skips a header and bad rows, and warns", () => {
  const p = parsePieces("piece,needle hours,drawing,sessions,price\nA,2,1,2,400\nbad,x,1,1,1\nB,0,1,1,1\nC,1.5,,,");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].sessions, 1);
  assert.equal(p.rows[1].drawingHours, 0);
  assert.equal(p.rows[1].price, 0);
  assert.match(p.warnings[0], /2 piece line/);
  assert.match(parsePieces("").error, /Add at least one/);
});

test("hand-calculated: 3 needle hours + 1 drawing hour at $50, no shop, no fee", () => {
  const l = analyze(base, one("A,3,1,1,300")).lines[0];
  near(l.allHours, 4);
  near(l.cost, 200);
  near(l.floor, 200);
  near(l.profit, 100);
  near(l.effectiveHourly, 300 / 4);
  assert.equal(l.meetsFloor, true);
});

test("setup is per session and touch-ups add a share of needle time", () => {
  const r = analyze({ ...base, setupMinutesPerSession: 30, touchUpPct: 10, suppliesPerSession: 10 }, one("A,4,0,2,"));
  const l = r.lines[0];
  near(l.setupHours, 1);
  near(l.touchUpHours, 0.4);
  near(l.allHours, 5.4);
  near(l.supplies, 20);
  near(l.cost, 5.4 * 50 + 20);
});

test("a shop cut shrinks what is kept and grosses the lowest price up", () => {
  const r = analyze({ ownerHourly: 50, shopCutPct: 50, cardFeePct: 0 }, one("A,2,0,1,400"));
  const l = r.lines[0];
  near(r.keepShare, 0.5);
  near(l.floor, 200);
  near(l.shopCut, 200);
  near(l.profit, 100);
  near(l.effectiveHourly, 100);
});

test("booth rent is spread over tattooing hours and charged on needle time", () => {
  const r = analyze({ ...base, boothRentPerMonth: 1200, tattooHoursPerMonth: 80 }, one("A,2,0,1,"));
  near(r.rentPerHour, 15);
  near(r.lines[0].rent, 30);
  near(r.lines[0].cost, 100 + 30);
});

test("a flat price under the lowest price is flagged and named", () => {
  const r = analyze(base, one("Big,10,6,2,500\nSmall,1,0,1,200"));
  assert.equal(r.lines[0].meetsFloor, false);
  assert.equal(r.lines[1].meetsFloor, true);
  assert.match(r.verdict, /1 of 2/);
  assert.match(r.verdict, /Big/);
  assert.ok(r.warnings.some((w) => /Big/.test(w)));
});

test("shop minimum is the lowest price of a half-hour one-session flash piece", () => {
  const r = analyze({ ownerHourly: 60, setupMinutesPerSession: 30, suppliesPerSession: 12, shopCutPct: 20, cardFeePct: 0 }, one("A,1,0,1,"));
  near(r.shopMinimum, (60 * 1 + 12) / 0.8);
});

test("ladder shows where your needle rate stops covering the target", () => {
  const r = analyze({ ...base, quotedRate: 60, drawingPerTattooHour: 1, setupMinutesPerSession: 60 }, one("A,1,0,1,"));
  assert.equal(r.ladder.length, 6);
  near(r.ladder[0].price, 60);
  assert.equal(r.ladder[0].coversTarget, false);
  assert.ok(r.ladder[0].needleRateNeeded > r.ladder[5].needleRateNeeded);
  assert.ok(r.warnings.some((w) => /no piece size/.test(w)));
  assert.equal(analyze(base, one("A,1,0,1,")).ladder.length, 0);
});

test("input validation", () => {
  assert.match(analyze({}, one("A,1,0,1,")).error, /hourly take-home/);
  assert.match(analyze({ ...base, boothRentPerMonth: 100 }, one("A,1,0,1,")).error, /hours per month/);
  assert.match(analyze({ ownerHourly: 50, shopCutPct: 90, cardFeePct: 10 }, one("A,1,0,1,")).error, /under 100/);
  assert.match(analyze({ ...base, suppliesPerSession: "x" }, one("A,1,0,1,")).error, /suppliesPerSession/);
});

test("sample runs, has an under-water piece, and exports CSV", () => {
  const s = sampleJob();
  const r = analyze(s.settings, parsePieces(s.pieces).rows);
  assert.ok(!r.error);
  assert.ok(r.lines.some((l) => l.meetsFloor === false));
  assert.ok(r.lines.some((l) => l.meetsFloor === true));
  const csv = reportCsv(r).trim().split("\n");
  assert.equal(csv.length, r.lines.length + 1);
  assert.match(csv[0], /Lowest price/);
});

test("money formatting", () => {
  assert.equal(money(1234.4), "$1,234");
  assert.equal(money2(-5), "-$5.00");
});
