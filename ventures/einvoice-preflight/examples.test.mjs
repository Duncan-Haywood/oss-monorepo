// The shipped examples, run through the *browser* reader.
//
// Why this file exists
// --------------------
// `tests/test_examples.py` already runs examples/ through the Python CLI. The
// browser tool is a second, independent implementation of the same readers, and
// nothing ran the examples through it. Every hand-written fixture in the other
// .test.mjs files spells out `cac:PartyIdentification/cbc:ID`, so the JS reader's
// requirement that a party carry one was never exercised -- while EN 16931 makes
// the seller and buyer identifiers (BT-29/BT-46) optional, and none of the
// shipped UBL examples have them.
//
// The result: `parse_ubl_invoice` in Python read all three XML examples, and the
// page published next to those same files answered "UBL field ID is missing" and
// refused every one of them. 170 JS tests were green throughout. This closes that
// gap by asserting the browser reader against the files a visitor is invited to
// drop in, and by comparing it to the Python reader's documented resolution order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseCiiInvoice } from "./cii.mjs";
import { parseInvoiceSource } from "./report.mjs";
import { parseUblInvoice, looksLikeXml } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const example = (name) => readFileSync(path.join(HERE, "examples", name), "utf8");

const UBL_EXAMPLES = ["ubl-invoice.xml", "ubl-invoice-with-defects.xml"];

for (const name of UBL_EXAMPLES) {
  test(`the browser reader can read examples/${name}`, () => {
    // The regression itself: this threw "UBL field ID is missing" for every
    // shipped UBL example, so the drop target advertised on the landing page
    // rejected the very files the page offers.
    const invoice = parseUblInvoice(example(name));
    assert.ok(invoice.invoice_number, "expected an invoice number");
    assert.ok(Array.isArray(invoice.lines) && invoice.lines.length > 0);
  });
}

test("examples/ubl-invoice.xml is clean, as the file claims", () => {
  // Mirrors CleanExamplesTest in tests/test_examples.py. A clean example that
  // reports findings is a broken example, and a reader that cannot open it at
  // all is worse.
  assert.deepEqual(checkInvoice(parseUblInvoice(example("ubl-invoice.xml"))), []);
});

test("examples/ubl-invoice-with-defects.xml reports defects rather than a read error", () => {
  const findings = checkInvoice(parseUblInvoice(example("ubl-invoice-with-defects.xml")));
  assert.ok(findings.length > 0, "the defects example should report findings");
});

test("a party identifier falls back through the EN 16931 order", () => {
  // Neither party in the example carries cac:PartyIdentification/cbc:ID; both
  // are identified by their Peppol electronic address. Pinned to the same
  // values tests/test_examples.py asserts for the Python reader, so the two
  // implementations cannot drift on what identifies a party.
  const invoice = parseUblInvoice(example("ubl-invoice.xml"));
  assert.equal(invoice.supplier.name, "Supplier GmbH");
  assert.equal(invoice.supplier.id, "4012345000009");
  assert.equal(invoice.supplier.vat_id, "DE136695976");
  assert.equal(invoice.customer.name, "Customer AG");
  assert.equal(invoice.customer.id, "4098765000003");
});

test("a party with no identifier at all is readable, and reported as INV-005", () => {
  // The distinction that matters: an absent identifier is a *finding*, not a
  // reason to refuse the document. Refusing it told the user nothing about
  // their invoice.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>INV-NO-PARTY-ID</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consulting</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount>100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount>119.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount>119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
  const invoice = parseUblInvoice(xml);
  assert.equal(invoice.supplier.id, "");
  assert.equal(invoice.supplier.name, "Supplier");
  const rules = new Set(checkInvoice(invoice).map((f) => f.rule));
  assert.ok(rules.has("INV-005"), `expected INV-005, got ${[...rules].join(", ")}`);
});

test("a legal name in PartyLegalEntity is a name, not a read error", () => {
  // XRechnung commonly omits cac:PartyName entirely.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>INV-LEGAL-NAME</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>Supplier GmbH</cbc:RegistrationName>
      <cbc:CompanyID>HRB 1234</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consulting</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount>100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount>119.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount>119.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
  const invoice = parseUblInvoice(xml);
  assert.equal(invoice.supplier.name, "Supplier GmbH");
  assert.equal(invoice.supplier.id, "HRB 1234");
});

test("the CII example is readable by the browser tool", async () => {
  // The CLI already read examples/cii-invoice.xml. The page next to that
  // file used to throw "UBL document root must be Invoice, CreditNote, or
  // DebitNote". parseInvoiceSource now routes CrossIndustryInvoice through
  // the CII reader so a dropped XRechnung CII / Factur-X XML is checked.
  const xml = example("cii-invoice.xml");
  assert.equal(looksLikeXml("cii-invoice.xml", xml), true);
  const invoice = parseCiiInvoice(xml);
  assert.equal(invoice.invoice_number, "INV-2026-0043");
  assert.deepEqual(checkInvoice(invoice), []);
  assert.deepEqual(checkInvoice(await parseInvoiceSource("cii-invoice.xml", xml)), []);
});
