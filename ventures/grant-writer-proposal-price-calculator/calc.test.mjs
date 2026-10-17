import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProposals, hourlyFloor, priceFor, analyse, money } from "./calc.mjs";

const base = { targetHourly: 60, billablePct: 75, seTaxPct: 7.65, overheadPerHour: 5, bufferPct: 20, monthlyHours: 100 };

test("parseProposals reads names, hours, fee and award; reports bad lines", () => {
  const { rows, bad } = parseProposals("Proposal,Hours,Fee,Award\nCity Arts, 30, $3,000\nLibrary\t40\t\t50000\nbroken\nZero, 0\nNeg, 10, -5");
  // "$3,000" splits on the comma, so the fee column reads "$3" and the award "000"
  assert.equal(rows.length, 2);
  assert.equal(rows[1].name, "Library");
  assert.equal(rows[1].quoted, null);
  assert.equal(rows[1].award, 50000);
  assert.equal(bad.length, 3);
});

test("hourlyFloor grosses up for unbillable time, overhead and tax", () => {
  // (60/0.75 + 5) / (1-0.0765) = 85 / 0.9235
  assert.equal(hourlyFloor(base), Math.round((85 / 0.9235) * 100) / 100);
});

test("hourlyFloor is null without a target and ignores nonsense", () => {
  assert.equal(hourlyFloor({}), null);
  assert.equal(hourlyFloor({ targetHourly: -5 }), null);
  assert.equal(hourlyFloor({ targetHourly: 50 }), 50);
});

test("billable share above 100 is capped and tax share capped at 50", () => {
  assert.equal(hourlyFloor({ targetHourly: 50, billablePct: 500 }), 50);
  assert.equal(hourlyFloor({ targetHourly: 50, seTaxPct: 99 }), 100);
});

test("priceFor pads hours then multiplies by the floor", () => {
  const p = priceFor(30, 100, 20);
  assert.equal(p.paddedHours, 36);
  assert.equal(p.fee, 3600);
});

test("analyse flags a quoted fee under the floor with the shortfall", () => {
  const a = analyse({ ...base, proposalText: "City Arts, 30, 1500\nLibrary, 20, 9000" });
  assert.equal(a.result.underpriced.length, 1);
  assert.equal(a.result.underpriced[0].name, "City Arts");
  assert.ok(a.result.rows[0].gap > 0);
  assert.ok(a.findings.some((f) => /below your floor/.test(f.title)));
});

test("analyse says every quoted fee clears when they do", () => {
  const a = analyse({ ...base, proposalText: "A, 10, 5000" });
  assert.ok(a.findings.some((f) => /clears the floor/.test(f.title)));
});

test("takeHomeHourly inverts the floor: quoting the floor fee returns the target", () => {
  const floor = hourlyFloor({ ...base, bufferPct: 0 });
  const a = analyse({ ...base, bufferPct: 0, proposalText: `A, 10, ${floor * 10}` });
  assert.ok(Math.abs(a.result.rows[0].takeHomeHourly - 60) < 0.2);
});

test("capacity overrun is flagged", () => {
  const a = analyse({ ...base, monthlyHours: 50, proposalText: "A, 40\nB, 40" });
  assert.ok(a.result.capacityUse > 1);
  assert.ok(a.findings.some((f) => /exceed your month/.test(f.title)));
});

test("fee share of award above 10 percent is flagged, below is not", () => {
  const hi = analyse({ ...base, proposalText: "A, 30, 5000, 20000" });
  assert.ok(hi.findings.some((f) => /share|of the award/.test(f.title)));
  const lo = analyse({ ...base, proposalText: "A, 30, 5000, 500000" });
  assert.ok(!lo.findings.some((f) => /of the award requested/.test(f.title)));
});

test("missing target returns no result and a high finding", () => {
  const a = analyse({ proposalText: "A, 10" });
  assert.equal(a.result, null);
  assert.equal(a.findings[0].severity, "high");
});

test("no proposals still returns the floor", () => {
  const a = analyse(base);
  assert.ok(a.result.floor > 0);
  assert.equal(a.result.rows.length, 0);
});

test("bad lines surface as a finding", () => {
  const a = analyse({ ...base, proposalText: "junk" });
  assert.equal(a.bad.length, 1);
  assert.equal(a.findings[0].title, "Some lines were not read");
});

test("flat-fee note is always present and money formats", () => {
  const a = analyse(base);
  assert.ok(a.findings.some((f) => /flat fee/.test(f.title)));
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(-50), "-$50");
});
