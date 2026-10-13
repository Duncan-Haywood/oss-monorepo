import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, incomeTax, class4, allowanceFor } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax and Class 4 on 40,000 profit", () => {
  assert.equal(incomeTax(40000), 5486);
  assert.equal(class4(40000), 1645.8);
  assert.equal(incomeTax(12570), 0);
  assert.equal(class4(12570), 0);
});

test("higher rate, Class 4 upper rate and allowance taper", () => {
  assert.equal(incomeTax(60000), 7540 + 0.4 * (60000 - 12570 - 37700));
  assert.equal(class4(60000), (50270 - 12570) * 0.06 + 9730 * 0.02);
  assert.equal(allowanceFor(110000), 12570 - 5000);
  assert.equal(allowanceFor(125140), 0);
  assert.equal(incomeTax(125140), 37700 * 0.2 + (125140 - 37700) * 0.4);
});

test("sample: 20% of 42,000 labour is 8,400 held back, refund 2,048.20", () => {
  const r = run({});
  assert.equal(r.deducted, 8400);
  assert.equal(r.profit, 37000);
  assert.equal(r.bill, 6351.8);
  assert.equal(r.refund, 2048.2);
  assert.equal(r.due, 0);
});

test("single invoice: deduction on labour only, materials and VAT paid in full", () => {
  const r = run({});
  assert.deepEqual(r.invoice, { labour: 1500, deduction: 300, paid: 1600 });
  assert.equal(run({ status: "unregistered", invLabour: 1000, invMaterials: 500, invVat: 0 }).invoice.deduction, 300);
  assert.equal(run({ status: "gross", invLabour: 1000 }).invoice.deduction, 0);
});

test("unregistered costs 10% of labour more and says so", () => {
  const r = run({ status: "unregistered" });
  assert.equal(r.deducted, 12600);
  assert.equal(r.heldBack30, 4200);
  assert.ok(r.findings.some((f) => /Registering with HMRC/.test(f.title)));
});

test("balance to pay when deductions fall short", () => {
  const r = run({ status: "gross", labour: 60000, materials: 0, costs: 5000, invLabour: "" });
  assert.equal(r.deducted, 0);
  assert.ok(r.due > 0);
  assert.equal(r.refund, 0);
});

test("statement mismatch is flagged", () => {
  assert.ok(run({ deducted: 7000 }).findings.some((f) => /statements show/.test(f.title)));
  assert.ok(!run({ deducted: 8400 }).findings.some((f) => /statements show/.test(f.title)));
});

test("gross payment turnover test messages", () => {
  assert.ok(run({ labour: 20000 }).findings.some((f) => /at least £30,000/.test(f.title)));
  assert.ok(run({ labour: 30000 }).findings.some((f) => /above the/.test(f.title)));
});

test("invoice-only mode works and bad input is rejected", () => {
  const r = compute({ status: "registered", invLabour: 800 });
  assert.equal(r.errors.length, 0);
  assert.equal(r.bill, undefined);
  assert.ok(compute({ status: "registered" }).errors.length);
  assert.ok(compute({ ...SAMPLE, status: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, labour: -5 }).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const s = summaryText(run({}));
  assert.ok(s.includes(VERIFY));
  assert.match(s, /Not tax advice/);
});
