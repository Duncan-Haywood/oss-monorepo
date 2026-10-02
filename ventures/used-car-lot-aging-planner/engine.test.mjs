import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseUnits, parseCurtailments, normalizeOptions, balance, dayCost, carryToDate,
  evaluatePlan, bestDay, plan, summarize, money, retailAt, wholesaleAt,
} from "./engine.mjs";

const O = normalizeOptions({});
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const unit = (over = {}) => ({ stock: "u", days: 10, cost: 10000, floored: 9000, retail: 12000, wholesale: 9500, retailDrop: 300, wholesaleDrop: 200, daysToSell: 30, dailyHold: 8, note: "", ...over });

test("parse reports line numbers and never throws", () => {
  const r = parseUnits([
    "stock,days,cost,floored,retail,wholesale,retail_drop_30,wholesale_drop_30,days_to_sell,daily_hold",
    "A1,10,9000,8000,11000,8500,300,200,30,8,note, with comma",
    "A2,ten,9000,8000,11000,8500,300,200,30,8",
    "A3,10,9000",
    "A4,10,0,8000,11000,8500,300,200,30,8",
    "A5,10,9000,8000,11000,8500,300,200,0.5,8",
    "A6,1.5,9000,8000,11000,8500,300,200,30,8",
    "# comment",
    "A7,5,$9,000,8000",
    "A8,0,\"9000\",8000,11000,8500,300,200,30,-1",
  ].join("\n"));
  assert.equal(r.units.length, 1);
  assert.equal(r.units[0].note, "note,with comma");
  assert.match(r.errors[0], /^line 3: days on lot must be a whole number/);
  assert.ok(r.errors.some((e) => /^line 4: expected stock,days/.test(e)));
  assert.ok(r.errors.some((e) => /^line 5: total cost must be a number, above 0/.test(e)));
  assert.ok(r.errors.some((e) => /^line 6: expected days to retail must be a number, 1 or more/.test(e)));
  assert.ok(r.errors.some((e) => /^line 7: days on lot must be a whole number/.test(e)));
  assert.ok(r.errors.some((e) => /^line 10: /.test(e)));
  assert.equal(parseUnits("").units.length, 0);
});

test("curtailment schedule and options are validated", () => {
  assert.deepEqual(parseCurtailments("120:10, 90:15%"), [{ day: 90, pct: 15 }, { day: 120, pct: 10 }]);
  assert.deepEqual(parseCurtailments("none"), []);
  assert.throws(() => parseCurtailments("90-10"), /day:percent/);
  assert.throws(() => parseCurtailments("90:60,120:50"), /more than 100/);
  assert.throws(() => normalizeOptions({ apr: -1 }), /apr/);
  assert.throws(() => normalizeOptions({ maxAge: 0 }), /maxAge/);
  assert.throws(() => normalizeOptions({ maxAge: 30.5 }), /maxAge/);
  assert.equal(normalizeOptions({ apr: "" }).apr, 9);
});

test("balance and daily carry agree with hand arithmetic", () => {
  const o = normalizeOptions({ apr: 10, cashRate: 5, lineValue: 2, curtailments: "60:10,90:20" });
  const u = unit({ cost: 10000, floored: 9000, dailyHold: 8 });
  assert.equal(balance(u, 59, o), 9000);
  assert.equal(balance(u, 60, o), 8100);
  near(balance(u, 90, o), 6300);
  const d = dayCost(u, 90, o);
  near(d.interest, (6300 * 0.1) / 365);
  near(d.ownCash, (3700 * 0.05) / 365);
  near(d.carry, (6300 * 0.1) / 365 + (3700 * 0.05) / 365 + 8);
  near(d.line, 6.3 * 2);
  // Carry to date is days 0..9 at the full balance.
  near(carryToDate(u, o), 10 * ((9000 * 0.1) / 365 + (1000 * 0.05) / 365 + 8));
  // A floored amount above cost never makes own cash negative.
  assert.equal(dayCost(unit({ cost: 8000, floored: 9000 }), 0, o).ownCash, 0);
});

test("price paths fall linearly from today and stop at zero", () => {
  const u = unit({ days: 10, retail: 12000, retailDrop: 300, wholesale: 300, wholesaleDrop: 600 });
  assert.equal(retailAt(u, 10), 12000);
  assert.equal(retailAt(u, 40), 11700);
  assert.equal(wholesaleAt(u, 25), 0);
});

test("a one-day horizon matches the closed form", () => {
  const o = normalizeOptions({ maxAge: 11, apr: 0, cashRate: 0, curtailments: "none" });
  const u = unit({ days: 10, dailyHold: 10, daysToSell: 4, retail: 12000, wholesale: 9500, wholesaleDrop: 300 });
  const keep = -10 + 0.25 * 12000 + 0.75 * (9500 - 10);
  const b = bestDay(u, o);
  near(b.value, Math.max(9500, keep));
  assert.equal(b.T, keep > 9500 ? 11 : 10);
});

// Deterministic pseudo-random generator so failures are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("backward induction equals the best of every wholesale day, computed directly", () => {
  const r = rng(42);
  let interior = 0;
  let now = 0;
  for (let k = 0; k < 400; k += 1) {
    const cost = 4000 + r() * 20000;
    const u = unit({
      days: Math.floor(r() * 150),
      cost,
      floored: cost * (0.6 + r() * 0.45),
      retail: cost * (0.9 + r() * 0.4),
      wholesale: cost * (0.75 + r() * 0.3),
      retailDrop: r() * 1200,
      wholesaleDrop: r() * 600,
      daysToSell: 5 + r() * 150,
      dailyHold: r() * 20,
    });
    const o = normalizeOptions({ apr: r() * 15, cashRate: r() * 10, lineValue: r() < 0.5 ? 0 : r() * 4, maxAge: 60 + Math.floor(r() * 200), curtailments: r() < 0.3 ? "none" : "60:10,90:10,120:20" });
    const H = Math.max(u.days, o.maxAge);
    let brute = -Infinity;
    let bruteT = null;
    let bruteKeep = null;
    for (let T = u.days; T <= H; T += 1) {
      const v = evaluatePlan(u, T, o).value;
      if (v > brute + 1e-9) { brute = v; bruteT = T; }
      if (T > u.days && (bruteKeep === null || v > bruteKeep)) bruteKeep = v;
    }
    const b = bestDay(u, o);
    if (bruteKeep === null) assert.equal(b.keepToday, null);
    else near(b.keepToday, bruteKeep, 1e-6 * Math.max(1, Math.abs(bruteKeep)));
    near(b.value, brute, 1e-6 * Math.max(1, Math.abs(brute)));
    near(evaluatePlan(u, b.T, o).value, brute, 1e-6 * Math.max(1, Math.abs(brute)));
    // Ties are allowed to differ in day only if they are worth the same.
    if (b.T !== bruteT) near(evaluatePlan(u, bruteT, o).value, evaluatePlan(u, b.T, o).value, 1e-6 * Math.max(1, Math.abs(brute)));
    if (b.T === u.days) now += 1;
    else if (b.T < H) interior += 1;
  }
  // The random cases must exercise wholesale-now and a day in between, not only the limit.
  assert.ok(now > 20, `wholesale-now cases ${now}`);
  assert.ok(interior > 20, `interior cases ${interior}`);
});

test("a unit at or past the limit is wholesaled now", () => {
  const p = plan({ units: [unit({ days: 200 })] }, { maxAge: 180 });
  assert.equal(p.rows[0].wholesaleIn, 0);
  assert.equal(p.rows[0].leftByWaiting, 0);
  assert.ok(p.findings.some((f) => f.rule === "limit"));
});

test("raising the line value wholesales more units and frees more line", () => {
  const parsed = parseUnits(readFileSync(new URL("./fixtures/lot.csv", import.meta.url), "utf8"));
  const a = plan(parsed, {});
  const b = plan(parsed, { lineValue: 2 });
  assert.ok(b.totals.wholesaleNow > a.totals.wholesaleNow);
  assert.ok(b.totals.lineFreedNow > a.totals.lineFreedNow);
  assert.ok(b.totals.planLineDays < a.totals.planLineDays);
});

test("ranking puts wholesale-now units first, then the lowest earnings per $1,000 of line per day", () => {
  const p = plan(parseUnits(readFileSync(new URL("./fixtures/lot.csv", import.meta.url), "utf8")), {});
  const firstHold = p.ranked.findIndex((r) => r.wholesaleIn > 0);
  assert.ok(firstHold > 0);
  assert.ok(p.ranked.slice(0, firstHold).every((r) => r.wholesaleIn === 0 && r.perLineDay === null));
  const held = p.ranked.slice(firstHold);
  for (let i = 1; i < held.length; i += 1) assert.ok(held[i - 1].perLineDay <= held[i].perLineDay);
  // The plan is never worse than waiting, unit by unit.
  for (const r of p.rows) assert.ok(r.leftByWaiting >= -1e-9, r.stock);
});

test("summary text", () => {
  assert.equal(summarize(plan({ units: [] }, {})).status, "none");
  const s = summarize(plan(parseUnits(readFileSync(new URL("./fixtures/lot.csv", import.meta.url), "utf8")), {}));
  assert.equal(s.status, "gain");
  assert.match(s.text, /^10 units cost \$118\.80 a day to carry/);
  assert.equal(money(-0.001), "$0.00");
  assert.equal(money(-1234.5), "-$1,234.50");
});
