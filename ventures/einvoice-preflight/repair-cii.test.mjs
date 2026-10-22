import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairCii } from "./repair-cii.mjs";

const ex = (n) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");

test("a clean CII invoice comes back byte for byte", () => {
  const src = ex("xrechnung-cii-invoice.xml");
  const r = repairCii(src);
  assert.equal(r.repaired, false);
  assert.equal(r.xml, src);
});

test("broken line total, tax group and totals are recomputed; nothing else moves", () => {
  const src = ex("xrechnung-cii-invoice.xml");
  const broken = src
    .replace("<ram:LineTotalAmount>960.00", "<ram:LineTotalAmount>900.00")
    .replace("<ram:CalculatedAmount>190.00", "<ram:CalculatedAmount>150.00")
    .replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00")
    .replace("<ram:DuePayableAmount>1190.00", "<ram:DuePayableAmount>1.00");
  const r = repairCii(broken);
  assert.deepEqual(r.changes.map((c) => c.path), ["/lines/0/net", "/tax_breakdown/0/tax", "/totals/gross", "/totals/due"]);
  assert.equal(r.xml, src);
  assert.equal(r.remaining.length, r.before.length - r.before.filter((f) => r.remaining.every((g) => g.rule !== f.rule)).length);
});

test("a header allowance leaves tax and totals alone and says so", () => {
  const src = ex("xrechnung-cii-invoice.xml").replace(
    "<ram:SpecifiedTradePaymentTerms>",
    "<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>10.00</ram:ActualAmount></ram:SpecifiedTradeAllowanceCharge><ram:SpecifiedTradePaymentTerms>",
  );
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /header allowances/.test(s)));
  assert.ok(!r.changes.some((c) => c.path.startsWith("/totals") || c.path.startsWith("/tax_breakdown")));
});

test("unreadable quantity changes nothing", () => {
  const r = repairCii(ex("xrechnung-cii-invoice.xml").replace(/<ram:BilledQuantity[^>]*>8</, "<ram:BilledQuantity>x<"));
  assert.equal(r.repaired, false);
});
