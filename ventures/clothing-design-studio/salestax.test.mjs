import test from "node:test";
import assert from "node:assert/strict";
import { nexusCheck, STATES } from "./salestax.mjs";

test("a state over the sales line must register; one under need not", () => {
  const r = nexusCheck([{ state: "FL", salesUsd: 120000 }, { state: "TX", salesUsd: 120000 }]);
  assert.equal(r.rows[0].status, "over");
  assert.equal(r.rows[1].status, "under");
  assert.deepEqual(r.summary.registerIn, ["FL"]);
});
test("200 orders alone trip an 'or' state but not an 'and' state or a sales-only state", () => {
  const r = nexusCheck([{ state: "GA", salesUsd: 9000, transactions: 200 }, { state: "NY", salesUsd: 9000, transactions: 200 }, { state: "FL", salesUsd: 9000, transactions: 900 }]);
  assert.deepEqual(r.rows.map(x => x.status), ["over", "under", "under"]);
});
test("Illinois, Kentucky, Utah and Alaska are sales-only since the order test was dropped", () => {
  for (const state of ["IL", "KY", "UT", "AK"]) assert.equal(nexusCheck([{ state, salesUsd: 9000, transactions: 5000 }]).rows[0].status, "under", state);
  assert.equal(nexusCheck([{ state: "IL", salesUsd: 100000 }]).rows[0].status, "over");
});
test("New York needs both tests", () => {
  assert.equal(nexusCheck([{ state: "NY", salesUsd: 600000, transactions: 50 }]).rows[0].status, "under");
  assert.equal(nexusCheck([{ state: "NY", salesUsd: 600000, transactions: 100 }]).rows[0].status, "over");
});
test("planned sales flag a coming crossing; 80% flags near", () => {
  assert.equal(nexusCheck([{ state: "WA", salesUsd: 60000, plannedSalesUsd: 50000 }]).rows[0].status, "will-cross");
  assert.equal(nexusCheck([{ state: "WA", salesUsd: 85000 }]).rows[0].status, "near");
});
test("tax owed counts sales above the line at the base rate, zero if clothing is exempt", () => {
  const r = nexusCheck([{ state: "FL", salesUsd: 150000 }]).rows[0];
  assert.equal(r.owedUsd, 3000); // 50,000 x 6%
  assert.equal(nexusCheck([{ state: "FL", salesUsd: 150000, clothingExempt: true }]).rows[0].owedUsd, 0);
});
test("overrides replace the typed figures; no-tax states and bad input", () => {
  assert.equal(nexusCheck([{ state: "TX", salesUsd: 120000, salesThresholdUsd: 100000 }]).rows[0].status, "over");
  assert.equal(nexusCheck([{ state: "OR", salesUsd: 1e6 }]).rows[0].status, "no-tax");
  assert.equal(nexusCheck([{ state: "ZZ", salesUsd: 1 }]).ok, false);
  assert.equal(nexusCheck([{ state: "FL", salesUsd: -1 }]).ok, false);
  assert.equal(nexusCheck([]).ok, false);
  assert.ok(Object.keys(STATES).length >= 47);
});
