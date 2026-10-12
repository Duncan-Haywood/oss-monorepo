import { test } from "node:test";
import assert from "node:assert/strict";
import { bookExposure, callList, money } from "./calc.mjs";

const base = {
  premiumPct: 10, suretyPct: 20, bufPct: 10, ftaPct: 5, recoveryPct: 50, writingLimit: 200000, reserve: 15000, today: "2026-10-12", windowDays: 30,
  bonds: [
    { label: "A", face: 10000, collateral: 0, courtDate: "2026-10-20" },
    { label: "B", face: 50000, collateral: 25000, courtDate: "2026-11-30" },
    { label: "C", face: 5000, collateral: 5000, courtDate: "2026-10-05" },
  ],
};

test("premium, surety share, build-up fund and net are hand-counted", () => {
  const r = bookExposure(base);
  assert.equal(r.premium, 6500);
  assert.equal(r.suretyShare, 1300);
  assert.equal(r.buf, 650);
  assert.equal(r.netPremium, 4550);
  assert.equal(r.liability, 65000);
  assert.equal(r.collateral, 30000);
  assert.equal(r.uncollateralized, 35000);
});

test("loss if forfeited is the uncollateralized part after recovery", () => {
  const r = bookExposure(base);
  assert.deepEqual(r.bonds.map((b) => b.lossIfForfeit), [5000, 12500, 0]);
  assert.equal(r.lossIfAllForfeit, 17500);
  assert.equal(r.expectedLoss, 875);
  assert.equal(r.expectedNet, 3675);
  assert.equal(r.breakEvenFtaPct, 26);
});

test("cash coverage counts the reserve plus the build-up fund against the largest losses first", () => {
  const r = bookExposure(base);
  assert.equal(r.cash, 15650);
  assert.equal(r.covered, 1);
  assert.equal(r.forfeitableCount, 2);
  assert.equal(r.shortfall, 1850);
  assert.equal(r.largest.label, "B");
  assert.equal(r.utilizationPct, 32.5);
});

test("court dates split into upcoming, past due and undated", () => {
  const r = bookExposure({ ...base, bonds: [...base.bonds, { label: "D", face: 1000 }] });
  assert.deepEqual(r.upcoming.map((b) => [b.label, b.daysToCourt]), [["A", 8]]);
  assert.deepEqual(r.pastDue.map((b) => [b.label, b.daysToCourt]), [["C", -7]]);
  assert.deepEqual(r.undated.map((b) => b.label), ["D"]);
});

test("flags name the shortfall, the passed court date, and nothing about a healthy book", () => {
  const r = bookExposure(base);
  assert.ok(r.flags.some((f) => /fall \$1,850 short/.test(f.text)));
  assert.ok(r.flags.some((f) => /court date that has passed/.test(f.text)));
  const calm = bookExposure({ ...base, reserve: 100000, bonds: [{ label: "A", face: 10000, courtDate: "2026-12-01" }] });
  assert.deepEqual(calm.flags, []);
});

test("writing limit flags: over, and at 80 percent", () => {
  assert.ok(bookExposure({ ...base, writingLimit: 60000 }).flags.some((f) => f.level === "high" && /over the surety writing limit/.test(f.text)));
  assert.ok(bookExposure({ ...base, writingLimit: 75000 }).flags.some((f) => /87% of the writing limit/.test(f.text)));
});

test("a per-bond premium rate overrides the default", () => {
  const r = bookExposure({ ...base, bonds: [{ face: 10000, premiumPct: 8 }] });
  assert.equal(r.premium, 800);
});

test("bad input throws instead of clamping", () => {
  assert.throws(() => bookExposure({ ...base, bonds: [] }), /at least one open bond/);
  assert.throws(() => bookExposure({ ...base, bonds: [{ face: 1000, collateral: 2000 }] }), /collateral cannot exceed/);
  assert.throws(() => bookExposure({ ...base, suretyPct: 80, bufPct: 30 }), /cannot exceed 100%/);
  assert.throws(() => bookExposure({ ...base, bonds: [{ face: "abc" }] }), /must be a number/);
  assert.throws(() => bookExposure({ ...base, bonds: [{ face: 1000, courtDate: "2026-02-30" }] }), /not a real date/);
  assert.throws(() => bookExposure({ ...base, bonds: [{ face: 1000, courtDate: "10/20/2026" }] }), /YYYY-MM-DD/);
});

test("the call list puts past dates first and lists the window in order", () => {
  const text = callList(bookExposure(base));
  assert.ok(text.indexOf("Past the court date") < text.indexOf("Upcoming"));
  assert.match(text, /2026-10-20  A  \$10,000 bond, no collateral  \(8 days\)/);
  assert.match(text, /2026-10-05  C  \$5,000 bond, \$5,000 collateral/);
});

test("money rounds and signs", () => {
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-60), "-$60");
});
