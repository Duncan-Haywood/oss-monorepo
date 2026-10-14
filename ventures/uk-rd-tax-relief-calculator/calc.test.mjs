import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, RATES, effectiveRate } from "./calc.mjs";

const base = { staff: "", epw: "", subcontract: "", consumables: "", software: "", cloud: "", profit: "", totalSpend: "", payeNic: "", feePct: "" };

test("profitable company: 20% credit taxed at 25% nets 15p per pound", () => {
  const r = compute({ ...base, staff: "100000", profit: "1000000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.qualifying, 100000);
  assert.equal(r.rdec.gross, 20000);
  assert.equal(r.rdec.benefit, 15000);
  assert.equal(r.rdec.kind, "tax");
});

test("loss-maker without intensity gets 16.2p per pound, within the cap", () => {
  const r = compute({ ...base, staff: "100000", profit: "-50000", totalSpend: "1000000", payeNic: "40000" });
  assert.equal(r.rdec.benefit, 16200);
  assert.equal(r.eris, null);
  assert.equal(r.rdec.kind, "cash");
});

test("subcontractors and external workers count at 65%", () => {
  const r = compute({ ...base, epw: "10000", subcontract: "10000" });
  assert.equal(r.qualifying, 13000);
});

test("R&D-intensive loss-maker: ERIS beats the merged scheme", () => {
  const r = compute({ ...base, staff: "100000", profit: "-120000", totalSpend: "200000", payeNic: "40000" });
  assert.ok(r.intensive);
  assert.equal(r.best, "eris");
  // surrenderable = min(120000 + 86000, 186000) = 186000; x 14.5% = 26970
  assert.equal(r.eris.benefit, 26970);
  assert.ok(r.eris.benefit > r.rdec.benefit);
});

test("payable credit is capped at 20,000 + 300% of PAYE and NIC", () => {
  const r = compute({ ...base, staff: "400000", profit: "-500000", totalSpend: "2000000", payeNic: "0" });
  assert.equal(r.cap, 20000);
  assert.equal(r.rdec.benefit, 20000);
  assert.ok(r.rdec.capped);
  assert.ok(r.rdec.carried > 0);
});

test("marginal relief rate sits between 19% and 25%", () => {
  assert.equal(effectiveRate(40000), 0.19);
  assert.equal(effectiveRate(300000), 0.25);
  const mid = effectiveRate(150000);
  assert.ok(mid > 0.19 && mid < 0.25);
  assert.equal(RATES.rdec, 0.2);
});

test("adviser fee is a share of the best benefit", () => {
  const r = compute({ ...base, staff: "100000", profit: "1000000", feePct: "20" });
  assert.equal(r.fee, 3000);
});

test("worked sample runs and states it is not advice", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(r.bestBenefit > 0 && r.findings.length > 0);
  assert.match(summaryText(r), /Not tax advice/);
});

test("nothing entered warns, bad input is rejected", () => {
  assert.ok(compute(base).findings.some((f) => /Nothing qualifies/.test(f.title)));
  assert.ok(compute({ ...base, staff: "-1" }).errors.length);
  assert.ok(compute({ ...base, profit: "abc" }).errors.length);
  assert.ok(compute({ ...base, feePct: "150" }).errors.length);
});
