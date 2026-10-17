import test from "node:test";
import assert from "node:assert/strict";
import { compute, patientCost, deadlines, DEFAULT_SCENARIOS } from "./engine.mjs";

const base = { cobraPremium: 780, marketPremium: 210, months: 6, cobraDeductible: 3000, cobraDedMet: 2400, cobraOopMax: 8000, cobraOopMet: 2600, marketDeductible: 5500, marketOopMax: 9200 };

test("patientCost: deductible, coinsurance, cap", () => {
  const p = { dedLeft: 1000, oopLeft: 5000, coinsurance: 0.2 };
  assert.equal(patientCost(0, p), 0);
  assert.equal(patientCost(400, p), 400);
  assert.equal(patientCost(6000, p), 2000);
  assert.equal(patientCost(1e6, p), 5000);
  assert.equal(patientCost(500, { ...p, oopLeft: 0 }), 0);
});

test("carried-over accumulators make COBRA cheaper once care is large", () => {
  const r = compute(base);
  assert.equal(r.status, "ok");
  const injury = r.scenarios.find((s) => s.key === "injury");
  assert.equal(injury.cobraOop, 2280);
  assert.equal(injury.marketOop, 6200);
  assert.equal(injury.cheaper, "cobra");
  assert.equal(r.scenarios.find((s) => s.key === "healthy").cheaper, "marketplace");
  assert.equal(r.breakeven.kind, "at");
  assert.ok(Math.abs(r.breakeven.spend - 4875) <= 100);
});

test("no care at all: premiums alone decide, and 'never' when marketplace dominates", () => {
  const r = compute({ ...base, cobraDedMet: 0, cobraOopMet: 0, cobraDeductible: 5500, cobraOopMax: 9200 });
  assert.equal(r.breakeven.kind, "never");
  assert.equal(r.premiumGap, 570 * 6);
});

test("a cheaper COBRA is 'always' cheaper", () => {
  const r = compute({ ...base, cobraPremium: 150, marketPremium: 400 });
  assert.equal(r.breakeven.kind, "always");
});

test("own estimate is added in spend order and not duplicated", () => {
  const r = compute({ ...base, expectedSpend: 5000 });
  const spends = r.scenarios.map((s) => s.spend);
  assert.deepEqual(spends, [...spends].sort((a, b) => a - b));
  assert.equal(r.scenarios.length, DEFAULT_SCENARIOS.length + 1);
  assert.equal(compute({ ...base, expectedSpend: 2500 }).scenarios.length, DEFAULT_SCENARIOS.length);
});

test("validation", () => {
  assert.equal(compute({ ...base, cobraPremium: 0 }).status, "error");
  assert.equal(compute({ ...base, months: 19 }).status, "error");
  assert.equal(compute({ ...base, cobraOopMax: 0 }).status, "error");
  assert.equal(compute({ ...base, marketPremium: -5 }).status, "error");
  assert.equal(compute({ ...base, cobraPremium: "abc" }).status, "error");
  assert.equal(compute({ ...base, cobraCoinsurancePct: 120 }).status, "error");
});

test("deadlines: 60 days from the later of coverage end and notice, plus 45", () => {
  const d = deadlines({ lossDate: "2026-10-31" });
  assert.equal(d.electionDeadline, "2026-12-30");
  assert.equal(d.firstPremiumDue, "2027-02-13");
  assert.equal(d.marketplaceWindowEnds, "2026-12-30");
  assert.equal(d.marketplaceNoGapPickBy, "2026-10-31");
  assert.equal(d.marketplaceStartsIfPickedByThen, "2026-11-01");
  assert.equal(d.maxCobraEnds, "2028-04-30");
  const late = deadlines({ lossDate: "2026-10-31", noticeDate: "2026-11-20" });
  assert.equal(late.electionDeadline, "2027-01-19");
  assert.match(late.electionNoticeBasis, /notice/);
  assert.equal(deadlines({}), null);
  assert.ok(deadlines({ lossDate: "2026-02-30" }).error);
  assert.ok(deadlines({ lossDate: "2026-10-31", noticeDate: "nope" }).error);
});
