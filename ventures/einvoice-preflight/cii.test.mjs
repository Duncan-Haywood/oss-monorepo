import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseCiiInvoice, looksLikeCii } from "./cii.mjs";
import { looksLikeXml } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { parseInvoiceSource } from "./report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example = (name) => readFileSync(path.join(HERE, "examples", name), "utf8");

test("the shipped CII example is recognised as CII XML", () => {
  const xml = example("cii-invoice.xml");
  assert.equal(looksLikeXml("cii-invoice.xml", xml), true);
  assert.equal(looksLikeCii(xml), true);
  assert.equal(looksLikeCii(example("ubl-invoice.xml")), false);
});

test("the shipped CII example maps to the same facts the CLI pins", () => {
  const invoice = parseCiiInvoice(example("cii-invoice.xml"));
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.equal(invoice.issue_date, "2026-08-24");
  assert.equal(invoice.due_date, "2026-09-23");
  assert.equal(invoice.currency, "EUR");
  assert.equal(invoice.document_type, "invoice");
  assert.equal(invoice.document_code, "380");
  assert.equal(invoice.supplier.name, "Supplier GmbH");
  assert.equal(invoice.supplier.vat_id, "DE136695976");
  assert.equal(invoice.customer.name, "Acheteur SARL");
  assert.equal(invoice.lines[0].description, "Software integration hours");
  assert.equal(invoice.lines[0].net, "250.00");
  assert.equal(invoice.tax_breakdown[0].tax_category, "AE");
  assert.equal(invoice.payment.iban, "DE02120300000000202051");
  assert.equal(invoice.payment.means, "58");
  assert.equal(invoice.payment.remittance, "INV-2026-0043");
  assert.equal(invoice.tax_exemption_reason, "Reverse charge");
  assert.equal(invoice.buyer_reference, "04011000-98765-21");
});

test("the shipped CII example is clean under the browser checks", () => {
  assert.deepEqual(checkInvoice(parseCiiInvoice(example("cii-invoice.xml"))), []);
});

test("a missing reverse-charge reason is INV-035, not a read error", () => {
  const source = example("cii-invoice.xml").replace(
    "<ram:ExemptionReason>Reverse charge</ram:ExemptionReason>",
    "",
  );
  const rules = new Set(checkInvoice(parseCiiInvoice(source)).map((finding) => finding.rule));
  assert.ok(rules.has("INV-035"), `expected INV-035, got ${[...rules].join(", ")}`);
});

test("UNTDID 381 is a credit note", () => {
  const source = example("cii-invoice.xml").replace("<ram:TypeCode>380</ram:TypeCode>", "<ram:TypeCode>381</ram:TypeCode>");
  assert.equal(parseCiiInvoice(source).document_type, "credit_note");
});

test("a DTD is refused before the tree is walked", () => {
  assert.throws(
    () => parseCiiInvoice(`<!DOCTYPE CrossIndustryInvoice [<!ENTITY x "x">]>${example("cii-invoice.xml")}`),
    /DTD|entity/i,
  );
});

test("unrelated XML is not silently treated as CII", () => {
  assert.equal(looksLikeCii("<Order><ID>1</ID></Order>"), false);
  assert.throws(() => parseCiiInvoice("<Order><ID>1</ID></Order>"), /CrossIndustryInvoice/);
});

test("parseInvoiceSource routes the shipped CII example through the CII reader", async () => {
  const invoice = await parseInvoiceSource("cii-invoice.xml", example("cii-invoice.xml"));
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.deepEqual(checkInvoice(invoice), []);
});

test("an EXTENDED SpecifiedLogisticsServiceCharge counts as a header charge", () => {
  const charge = "<ram:SpecifiedLogisticsServiceCharge><ram:Description>Freight</ram:Description><ram:AppliedAmount>40.00</ram:AppliedAmount>"
    + "<ram:AppliedTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>AE</ram:CategoryCode><ram:RateApplicablePercent>0</ram:RateApplicablePercent></ram:AppliedTradeTax>"
    + "</ram:SpecifiedLogisticsServiceCharge>";
  const source = example("cii-invoice.xml")
    .replace("</ram:SpecifiedTradeSettlementPaymentMeans>", `</ram:SpecifiedTradeSettlementPaymentMeans>${charge}`)
    .replace("<ram:BasisAmount>250.00</ram:BasisAmount>", "<ram:BasisAmount>290.00</ram:BasisAmount>")
    .replace("<ram:ChargeTotalAmount>0.00", "<ram:ChargeTotalAmount>40.00")
    .replace("<ram:TaxBasisTotalAmount>250.00", "<ram:TaxBasisTotalAmount>290.00")
    .replace("<ram:GrandTotalAmount>250.00", "<ram:GrandTotalAmount>290.00")
    .replace("<ram:DuePayableAmount>250.00", "<ram:DuePayableAmount>290.00");
  const invoice = parseCiiInvoice(source);
  assert.deepEqual(invoice.adjustments, [{ kind: "charge", amount: 40, tax_percent: 0, tax_category: "AE", reason: "Freight" }]);
  assert.deepEqual(checkInvoice(invoice), []);
  const without = source.replace(charge, "");
  assert.ok(checkInvoice(parseCiiInvoice(without)).length > 0, "dropping the charge must break the totals");
});
