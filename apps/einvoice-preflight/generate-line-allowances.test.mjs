// Allowances and charges on a single line (EN 16931 BG-27, BG-28): a row discount by percent or
// amount and a surcharge, written in UBL and CII for every profile, read back by the checker and,
// where the official rules are installed, passed through EN 16931, XRechnung and Peppol BIS.
// Companies are made up; the VAT ID and IBAN are the public example values the other tests use.
import test from "node:test";
import assert from "node:assert/strict";
import { generateInvoice } from "./generate.mjs";
import { parseInvoiceSource } from "./report.mjs";
import { checkInvoice } from "./checks.mjs";
import { runPlain, plainAvailable } from "./plain-node.mjs";

const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const fatal = (r) => [...new Set(r.findings.filter((f) => f.severity !== "warning").map((f) => f.rule))].sort();

const draft = (lines, extra = {}) => ({
  number: "HT-2026-0784", issue_date: "2026-11-23", due_date: "2026-12-07", buyer_reference: "04011000-12345-34",
  seller: { name: "Haustechnik Beispiel GmbH", street: "Rohrweg 7", city: "Mannheim", postal_code: "68159", country: "DE", vat_id: "DE136695976", contact: { name: "Paul Beispiel", phone: "+49 621 456789", email: "rechnung@haustechnik.example" }, endpoint: { scheme: "EM", id: "rechnung@haustechnik.example" } },
  buyer: { name: "Wohnungsbau Muster eG", street: "Neckarstraße 40", city: "Mannheim", postal_code: "68161", country: "DE", endpoint: { scheme: "EM", id: "rechnungseingang@wohnungsbau.example" } },
  payment: { means: "58", iban: "DE02120300000000202051" },
  lines,
  ...extra,
});
const LINES = [
  { description: "Kupferrohr 15 mm", quantity: 24, unit: "MTR", unit_price: 8.4, tax_percent: 19, allowances: [{ reason: "Rabatt", percent: 10 }] },
  { description: "Pressbogen 15 mm", quantity: 36, unit_price: 4.85, tax_percent: 19, allowances: [{ reason: "Rabatt", percent: 15, amount: 26.19 }] },
  { description: "Montage Heizkörper", quantity: 8, unit: "HUR", unit_price: 62, tax_percent: 19, charges: [{ reason: "Notdienstzuschlag", amount: 40 }] },
  { description: "Thermostatkopf", quantity: 6, unit_price: 24.9, tax_percent: 19, allowances: [{ reason: "Rabatt", amount: 9.4 }] },
];

test("line nets are quantity x price less the line's allowances plus its charges", () => {
  const out = generateInvoice(draft(LINES), { profile: "en16931" });
  assert.ok(out.ok, JSON.stringify(out.errors));
  // 181.44 + 148.41 + 536.00 + 140.00; 19 % of 1005.85 = 191.11
  assert.deepEqual(out.totals, { net: 1005.85, tax: 191.11, gross: 1196.96, prepaid: 0, due: 1196.96 });
  assert.match(out.xml, /<cbc:LineExtensionAmount currencyID="EUR">181\.44<\/cbc:LineExtensionAmount>\s*<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReason>Rabatt<\/cbc:AllowanceChargeReason>\s*<cbc:MultiplierFactorNumeric>10<\/cbc:MultiplierFactorNumeric>\s*<cbc:Amount currencyID="EUR">20\.16<\/cbc:Amount>\s*<cbc:BaseAmount currencyID="EUR">201\.60<\/cbc:BaseAmount>/);
  assert.match(out.xml, /<cbc:ChargeIndicator>true<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReason>Notdienstzuschlag/);
  const cii = generateInvoice(draft(LINES), { format: "cii", profile: "en16931" });
  assert.match(cii.xml, /<ram:SpecifiedTradeAllowanceCharge>\s*<ram:ChargeIndicator><udt:Indicator>false<\/udt:Indicator><\/ram:ChargeIndicator>\s*<ram:CalculationPercent>10<\/ram:CalculationPercent>\s*<ram:BasisAmount>201\.60<\/ram:BasisAmount>\s*<ram:ActualAmount>20\.16<\/ram:ActualAmount>\s*<ram:Reason>Rabatt<\/ram:Reason>\s*<\/ram:SpecifiedTradeAllowanceCharge>\s*<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>181\.44</);
  // A line allowance is not a document-level one: no header AllowanceCharge, no AllowanceTotalAmount.
  assert.doesNotMatch(out.xml, /AllowanceTotalAmount/);
});

test("line allowances that do not add up, or have no reason, are refused before writing", () => {
  const bad = (l) => generateInvoice(draft([{ description: "X", quantity: 2, unit_price: 50, tax_percent: 19, ...l }]), { profile: "en16931" });
  assert.match(bad({ allowances: [{ reason: "Rabatt", percent: 10, amount: 9 }] }).errors[0].message, /10 % of 100\.00 is 10\.00, not 9\.00/);
  assert.equal(bad({ allowances: [{ percent: 10 }] }).errors[0].path, "lines[0].allowances[0].reason");
  assert.equal(bad({ charges: [{ reason: "Zuschlag" }] }).errors[0].path, "lines[0].charges[0].amount");
  assert.equal(bad({ allowances: [{ reason: "Rabatt", amount: -5 }] }).errors[0].path, "lines[0].allowances[0].amount");
  assert.match(bad({ allowances: [{ reason: "Rabatt", amount: 120 }] }).errors[0].message, /line net would be negative/);
  assert.equal(bad({ allowances: { reason: "Rabatt", amount: 5 } }).errors[0].path, "lines[0].allowances");
});

for (const format of ["ubl", "cii"]) {
  test(`${format.toUpperCase()}: the checker reads the line allowances back and agrees with every total`, async () => {
    const out = generateInvoice(draft(LINES, { allowances: [{ reason: "Projektnachlass", amount: 25, tax_percent: 19 }] }), { format, profile: "en16931" });
    assert.ok(out.ok, JSON.stringify(out.errors));
    const invoice = await parseInvoiceSource("out.xml", out.xml);
    assert.equal(invoice.lines[0].adjustments[0].kind, "allowance");
    assert.equal(Number(invoice.lines[0].adjustments[0].amount), 20.16);
    assert.equal(invoice.lines[2].adjustments[0].kind, "charge");
    assert.deepEqual(checkInvoice(invoice).filter((f) => f.severity !== "warning"), []);
    // A line net written without its discount is caught (INV-012).
    const broken = format === "ubl"
      ? out.xml.replace('<cbc:LineExtensionAmount currencyID="EUR">181.44', '<cbc:LineExtensionAmount currencyID="EUR">201.60')
      : out.xml.replace("<ram:LineTotalAmount>181.44", "<ram:LineTotalAmount>201.60");
    assert.ok(checkInvoice(await parseInvoiceSource("out.xml", broken)).some((f) => f.rule === "INV-012"));
  });

  for (const profile of ["en16931", "xrechnung", "peppol"]) {
    test(`${format.toUpperCase()} ${profile}: line allowances and charges add no finding under the official rules`, { skip }, async () => {
      const withAdj = generateInvoice(draft(LINES), { format, profile });
      const without = generateInvoice(draft(LINES.map(({ allowances, charges, ...l }) => l)), { format, profile });
      assert.ok(withAdj.ok && without.ok);
      const r = await runPlain(withAdj.xml);
      assert.deepEqual(r.skipped, []);
      // The same findings as the same invoice without them (the made-up EM addresses draw some
      // profile notices of their own), so the line allowances themselves are clean.
      assert.deepEqual(fatal(r), fatal(await runPlain(without.xml)));
      if (profile === "en16931") assert.deepEqual(fatal(r), []);
    });
  }
}

test("the official rules see a line allowance: one without a reason is BR-42, in UBL and CII", { skip }, async () => {
  const out = generateInvoice(draft(LINES), { profile: "en16931" });
  const noReason = out.xml.replace("<cbc:AllowanceChargeReason>Rabatt</cbc:AllowanceChargeReason>", "");
  assert.ok(fatal(await runPlain(noReason)).includes("BR-42"));
  const cii = generateInvoice(draft(LINES), { format: "cii", profile: "en16931" });
  const ciiNoReason = cii.xml.replace("<ram:Reason>Rabatt</ram:Reason>", "");
  assert.ok(fatal(await runPlain(ciiNoReason)).includes("BR-42"));
});
