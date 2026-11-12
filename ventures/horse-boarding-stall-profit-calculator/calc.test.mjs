import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("profit follows the stated rule on the sample", () => {
  const r = compute(raw());
  const horses = 17, k = 0.97, labourPer = (20 * 30.4 / 60) * 15;
  const expected = horses * ((550 + 40) * k - 160 - 55 - labourPer) - 3000;
  assert.ok(Math.abs(r.profit - expected) < 0.01);
  assert.equal(r.horses, horses);
});

test("pricing board at the target price really pays the target", () => {
  const r = compute(raw());
  const back = compute(raw({ boardPrice: String(r.targetPrice) }));
  assert.ok(Math.abs(back.profit - 2000) < 1);
});

test("break-even price gives zero profit and break-even occupancy gives zero profit", () => {
  const r = compute(raw());
  assert.ok(Math.abs(compute(raw({ boardPrice: String(r.breakEvenPrice) })).profit) < 1);
  const cheap = raw({ fixedMonth: "1000" });
  const at = compute({ ...cheap, occupancy: String(compute(cheap).breakEvenOcc) });
  assert.ok(Math.abs(at.profit) < 1);
});

test("a loss is flagged high with the break-even board price", () => {
  const r = compute(raw({ boardPrice: "300" }));
  assert.ok(r.profit < 0);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /loses about/);
});

test("a horse that costs more than it earns makes break-even unreachable", () => {
  const r = compute(raw({ boardPrice: "100", extras: "0" }));
  assert.equal(r.breakEvenOcc, null);
  assert.ok(r.findings.some((f) => /costs more to keep/.test(f.title)));
  assert.match(summaryText(r), /not reachable/);
});

test("break-even above 100 percent is flagged", () => {
  const r = compute(raw({ fixedMonth: "20000" }));
  assert.ok(r.breakEvenOcc > 100);
  assert.ok(r.findings.some((f) => /Even full/.test(f.title)));
});

test("sweep covers fixed steps plus the current occupancy and is sorted", () => {
  const r = compute(raw({ occupancy: "85" }));
  assert.deepEqual(r.sweep.map((x) => x.occ), [50, 60, 70, 80, 85, 90, 100]);
  assert.ok(r.sweep[0].profit < r.sweep[6].profit);
  const lines = sweepCsv(r).split("\n");
  assert.equal(lines[0], "occupancy_pct,horses,monthly_revenue,monthly_profit");
  assert.equal(lines.length, 8);
});

test("optional fields may be blank", () => {
  const r = compute({ stalls: "10", occupancy: "100", boardPrice: "500", feed: "150", fixedMonth: "1000" });
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.profit - (10 * 350 - 1000)) < 0.01);
});

test("bad input is reported, not computed", () => {
  assert.ok(compute(raw({ stalls: "0" })).errors.length);
  assert.ok(compute(raw({ stalls: "2.5" })).errors.length);
  assert.ok(compute(raw({ occupancy: "120" })).errors.length);
  assert.ok(compute(raw({ boardPrice: "abc" })).errors.length);
  assert.ok(compute(raw({ badDebt: "60" })).errors.length);
  assert.ok(compute(raw({ wage: "-5" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  const s = summaryText(compute(raw()));
  assert.match(s, /Horse boarding: 20 stalls, 85% full/);
});

// Added by quality audit round 53 (portfolio/quality/audits/2026-11-12-horse-boarding-stall-profit-calculator.json):
// the occupancy table, the hourly-pay finding and the warning thresholds had no test.
test("the occupancy table's row at today's occupancy equals the headline profit, and other rows follow the rule", () => {
  const r = compute(raw());
  const row = r.sweep.find((x) => x.occ === 85);
  assert.equal(row.profit, r.profit);
  // 50% full: 10 horses x 205.30 margin - 3000 fixed = -947.00 (hand-computed)
  assert.equal(r.sweep.find((x) => x.occ === 50).profit, -947);
  assert.equal(r.sweep.find((x) => x.occ === 100).revenue, 20 * 572.3);
});

test("the hourly-pay finding is profit plus labour over care hours", () => {
  const r = compute(raw());
  // labour 17 x 152 = 2584, profit 490.10, hours 17 x 20 x 30.4 / 60 = 172.27 -> $17.85 an hour
  const f = r.findings.find((x) => /pays you about/.test(x.title));
  assert.match(f.title, /\$17\.85 an hour for 172 hours/);
});

test("the thin-margin warning fires within 10 points of break-even, not beyond", () => {
  // margin 205.30 a horse; fixed 3000 -> 14.61 horses = 73.1% break-even
  const near = compute(raw({ occupancy: "80" }));
  assert.ok(near.findings.some((f) => /A couple of empty stalls/.test(f.title)));
  const far = compute(raw({ occupancy: "85" })); // 11.9 points above
  assert.ok(!far.findings.some((f) => /A couple of empty stalls/.test(f.title)));
});

test("the unpaid-board note starts at exactly 5 percent", () => {
  assert.ok(compute(raw({ badDebt: "5" })).findings.some((f) => /unpaid board costs/.test(f.title)));
  assert.ok(!compute(raw({ badDebt: "4.9" })).findings.some((f) => /unpaid board costs/.test(f.title)));
});

test("an occupancy typed as a fraction is rejected with a hint", () => {
  const r = compute(raw({ occupancy: "0.85" }));
  assert.match(r.errors.join(" "), /looks like a fraction.*85/);
});
