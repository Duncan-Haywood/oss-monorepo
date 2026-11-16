import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("profit follows the stated rule on the sample", () => {
  const r = compute(raw());
  const nights = 40 * 6 * 30.4 * 0.55, k = 0.92;
  const per = (48 + 6 / 2.5) * k - 4 - (15 / 60) * 16 * 1.12 / 2.5;
  assert.ok(Math.abs(r.profit - (nights * per - 120000)) < 0.01);
  assert.ok(Math.abs(r.nights - nights) < 1e-9);
});

test("pricing at the target rate really pays the target", () => {
  const r = compute(raw());
  const back = compute(raw({ nightly: String(r.targetRate) }));
  assert.ok(Math.abs(back.profit - 40000) < 25);
});

test("break-even rate and break-even occupancy give zero profit", () => {
  const r = compute(raw());
  assert.ok(Math.abs(compute(raw({ nightly: String(r.breakEvenRate) })).profit) < 25);
  const at = compute(raw({ occupancy: String(r.breakEvenOcc) }));
  assert.ok(Math.abs(at.profit) < 5);
});

test("a loss is flagged high with the break-even rate", () => {
  const r = compute(raw({ nightly: "25" }));
  assert.ok(r.profit < 0);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /loses about/);
});

test("a night that costs more than it earns makes break-even unreachable", () => {
  const r = compute(raw({ nightly: "2", stayFee: "0" }));
  assert.equal(r.breakEvenOcc, null);
  assert.match(summaryText(r), /not reachable/);
});

test("break-even above 100 percent is flagged", () => {
  const r = compute(raw({ fixedYear: "400000" }));
  assert.ok(r.breakEvenOcc > 100);
  assert.ok(r.findings.some((f) => /Even full/.test(f.title)));
});

test("sweep covers fixed steps plus the current occupancy and is sorted", () => {
  const r = compute(raw({ occupancy: "55" }));
  assert.deepEqual(r.sweep.map((x) => x.occ), [30, 40, 50, 55, 60, 70, 80, 90]);
  assert.ok(r.sweep[0].profit < r.sweep[7].profit);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[0], "occupancy_pct,occupied_nights,yearly_revenue,yearly_profit");
  assert.equal(lines.length, 9);
});

test("optional fields may be blank", () => {
  const r = compute({ sites: "10", openMonths: "12", occupancy: "100", nightly: "30", fixedYear: "1000" });
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.profit - (10 * 12 * 30.4 * 30 - 1000)) < 0.01);
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ sites: "0" })).errors.length);
  assert.ok(compute(raw({ openMonths: "13" })).errors.length);
  assert.ok(compute(raw({ occupancy: "120" })).errors.length);
  assert.ok(compute(raw({ nightly: "abc" })).errors.length);
  assert.ok(compute(raw({ platformPct: "60" })).errors.length);
  assert.ok(compute(raw({ avgStay: "0.5" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(compute(raw())), /Campground: 40 sites, 6 months open/);
});

// Red team 2026-11-13: a non-positive margin per night must not read as a gain per booking.
test("a night that loses money is not called a gain, and an empty night is not called a cost", () => {
  const r = compute(raw({ nightly: "2", stayFee: "0", platformPct: "0", turnMin: "0", varNight: "5" }));
  assert.equal(r.margin, -3);
  const titles = r.findings.map((f) => f.title).join("\n");
  assert.doesNotMatch(titles, /adds about -\$/);
  assert.doesNotMatch(titles, /sits empty costs you/);
  assert.match(titles, /costs about \$3\.00 more than it brings in/);
});

test("a zero margin per night is not called a loss per night", () => {
  const r = compute(raw({ nightly: "5", stayFee: "0", platformPct: "0", turnMin: "0", varNight: "5" }));
  assert.equal(r.margin, 0);
  const titles = r.findings.map((f) => f.title).join("\n");
  assert.doesNotMatch(titles, /costs more than it brings in/);
  assert.match(titles, /brings in exactly what it costs/);
});

// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-campground-site-profit-calculator.json, defect 0).
test("turnover labour carries the payroll burden, and a bare wage is called out", () => {
  const base = compute(raw({ burdenPct: "0" })), burd = compute(raw({ burdenPct: "20" }));
  const nights = 40 * 6 * 30.4 * 0.55;
  // By hand: 15 min / 60 x $16 / 2.5 nights = $1.60 a night; 20% burden adds $0.32 a night.
  assert.ok(Math.abs(base.labour - nights * 1.6) < 0.01);
  assert.ok(Math.abs(burd.labour - nights * 1.92) < 0.01);
  assert.ok(Math.abs((base.profit - burd.profit) - nights * 0.32) < 0.02);
  assert.ok(burd.breakEvenRate > base.breakEvenRate);
  assert.ok(base.findings.some((f) => /bare \$16\.00 wage.*7\.65%/.test(f.title)));
  assert.ok(!burd.findings.some((f) => /bare/.test(f.title)));
  assert.ok(!compute(raw({ burdenPct: "0", turnMin: "0" })).findings.some((f) => /bare/.test(f.title)));
  assert.match(compute(raw({ burdenPct: "-1" })).errors.join(" "), /Payroll burden must be 0 or more/);
  assert.equal(compute(raw({ burdenPct: "" })).input.burdenPct, 0);
});

// Red team 2026-11-16: below break-even occupancy the page said "loses about $16,385" and, in the
// same list, "One rainy month can turn it into a loss."
test("near break-even is a warning above it; below it the gap is stated, not a future risk", () => {
  const be = compute(raw()).breakEvenOcc; // about 40.5%
  const near = compute(raw({ occupancy: String(Math.ceil(be) + 5) }));
  assert.ok(near.profit > 0);
  assert.ok(near.findings.some((f) => f.severity === "medium" && /rainy month/.test(f.title)));
  const edge = compute(raw({ occupancy: String(Math.ceil(be) + 9.5) }));
  assert.ok(edge.findings.some((f) => /rainy month/.test(f.title)), "within 10 points is near");
  const clear = compute(raw({ occupancy: String(be + 10) }));
  assert.ok(!clear.findings.some((f) => /rainy month/.test(f.title)), "10 points clear is not near");
  const below = compute(raw({ occupancy: "35" }));
  assert.ok(below.profit < 0);
  assert.ok(!below.findings.some((f) => /rainy month|turn it into a loss/.test(f.title)));
  assert.ok(below.findings.some((f) => /Break-even is 41% full and you run 35%/.test(f.title) && /more occupied nights/.test(f.title)));
});

test("a campground that exactly breaks even is not said to lose money", () => {
  const z = compute(raw({ nightly: "0", stayFee: "0", varNight: "0", turnMin: "0", fixedYear: "0", platformPct: "0", target: "0" }));
  assert.equal(z.profit, 0);
  assert.ok(!z.findings.some((f) => /loses/.test(f.title)));
});
