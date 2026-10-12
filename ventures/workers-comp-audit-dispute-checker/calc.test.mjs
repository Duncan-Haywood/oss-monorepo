import { test } from "node:test";
import assert from "node:assert/strict";
import { auditDispute, overtimeExcluded, loadFactor, disputeNote } from "./calc.mjs";

const base = {
  mod: 1.1,
  classes: [{ label: "Roofing", auditedPayroll: 300000, rate: 20, auditedOvertime: 0, ownPayroll: 300000, ownOvertime: 30000 }],
  subs: [{ label: "Ace Electric", amount: 40000, rate: 6, certificate: true }],
  officers: [{ name: "Owner", auditedPayroll: 150000, minPayroll: 50000, maxPayroll: 120000, rate: 20 }],
};

test("overtime premium share is (m-1)/m of overtime wages", () => {
  assert.equal(overtimeExcluded(30000, 1.5), 10000);
  assert.equal(overtimeExcluded(30000, 2), 15000);
  assert.equal(overtimeExcluded("", 1.5), 0);
  assert.throws(() => overtimeExcluded(100, 5));
});

test("load factor multiplies mod, schedule, discount and surcharge in order", () => {
  assert.equal(loadFactor({ mod: 1.1 }), 1.1);
  assert.equal(Math.round(loadFactor({ mod: 1, schedulePct: 10, discountPct: 10, surchargePct: 0 }) * 10000) / 10000, 0.99);
});

test("hand-counted: each cause priced alone", () => {
  const r = auditDispute(base);
  const by = Object.fromEntries(r.items.map((i) => [i.kind, i.dollars]));
  assert.equal(by.overtime, -2200); // 10,000 excluded / 100 x 20 x 1.1
  assert.equal(by.sub, -2640); // 40,000 / 100 x 6 x 1.1
  assert.equal(by.officer, -6600); // 30,000 over the cap / 100 x 20 x 1.1
  assert.equal(r.claimable, 11440);
  assert.equal(r.againstYou, 0);
  assert.equal(r.net, 11440);
});

test("items are ordered biggest claim first", () => {
  assert.deepEqual(auditDispute(base).items.map((i) => i.kind), ["officer", "sub", "overtime"]);
});

test("a subcontractor with no certificate is information, not a claim", () => {
  const r = auditDispute({ ...base, classes: [], officers: [], subs: [{ label: "Bob", amount: 10000, rate: 10, certificate: false }] });
  assert.equal(r.claimable, 0);
  assert.equal(r.items[0].kind, "info");
  assert.match(r.items[0].detail, /\$1,100/);
});

test("an officer under the minimum is priced against the user", () => {
  const r = auditDispute({ classes: [], subs: [], officers: [{ name: "Owner", auditedPayroll: 20000, minPayroll: 50000, maxPayroll: 120000, rate: 10 }] });
  assert.equal(r.againstYou, 3000);
  assert.equal(r.claimable, 0);
  assert.equal(r.net, -3000);
});

test("payroll difference and reclass are separate lines", () => {
  const r = auditDispute({ classes: [{ label: "Framing", auditedPayroll: 100000, rate: 15, ownPayroll: 90000, moveToRate: 5, moveAmount: 20000 }], subs: [], officers: [] });
  const by = Object.fromEntries(r.items.map((i) => [i.kind, i.dollars]));
  assert.equal(by.payroll, -1500); // 10,000 / 100 x 15
  assert.equal(by.reclass, -2000); // 20,000 / 100 x (5 - 15)
  assert.equal(r.claimable, 3500);
});

test("an audit line with nothing to dispute yields no items", () => {
  assert.throws(() => auditDispute({ classes: [{ label: "A", auditedPayroll: 1000, rate: 5 }] }), /at least one/);
});

test("bad input throws instead of clamping", () => {
  assert.throws(() => auditDispute({ classes: [{ label: "A", auditedPayroll: -5, rate: 5 }] }));
  assert.throws(() => auditDispute({ classes: [{ label: "A", auditedPayroll: 1000, rate: 5, auditedOvertime: 5000 }] }));
  assert.throws(() => auditDispute({ classes: [], subs: [], officers: [{ name: "O", auditedPayroll: 1, minPayroll: 9, maxPayroll: 2, rate: 1 }] }));
  assert.throws(() => auditDispute({ ...base, mod: 9 }));
});

test("the dispute note lists only claimable lines and states figures not positions", () => {
  const note = disputeNote(auditDispute(base), { policy: "WC123", period: "2025" });
  assert.match(note, /WC123/);
  assert.match(note, /1\. Owner/);
  assert.match(note, /\$11,440/);
  assert.doesNotMatch(note, /you must|illegal|owed by law/i);
});
