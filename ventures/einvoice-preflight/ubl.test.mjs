import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { parseUblInvoice } from "./ubl.mjs";

const UBL_VALID = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-1</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("UBL invoice maps to the supported shape", () => {
  assert.deepEqual(checkInvoice(parseUblInvoice(UBL_VALID)), []);
});

test("UBL multiple tax totals are added", () => {
  const source = UBL_VALID.replace(
    '<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>',
    '<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19</cbc:TaxAmount></cac:TaxTotal><cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19</cbc:TaxAmount></cac:TaxTotal>',
  );
  const invoice = parseUblInvoice(source);
  assert.equal(invoice.totals.tax, 38);
  assert.deepEqual(checkInvoice(invoice), []);
});

test("UBL due date is preserved for date checks", () => {
  const invoice = parseUblInvoice(UBL_VALID.replace(
    "<cbc:ID>INV-XML-1</cbc:ID>",
    "<cbc:ID>INV-XML-1</cbc:ID><cbc:DueDate>2026-08-23</cbc:DueDate>",
  ));
  assert.equal(invoice.due_date, "2026-08-23");
  assert.ok(checkInvoice(invoice).some((error) => error.rule === "INV-021"));
});

test("UBL rejects entity declarations", () => {
  assert.throws(
    () => parseUblInvoice("<!DOCTYPE Invoice [ <!ENTITY x 'x'> ]>" + UBL_VALID),
    /entity/i,
  );
});

test("unknown UBL roots are rejected", () => {
  assert.throws(() => parseUblInvoice("<Order><cbc:ID>1</cbc:ID></Order>"), /Invoice, CreditNote, or DebitNote/);
});

test("UBL prepaid and payable map into remaining-balance checks", () => {
  const matching = UBL_VALID.replace(
    "<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>",
    "<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount><cbc:PrepaidAmount>38</cbc:PrepaidAmount><cbc:PayableAmount>200</cbc:PayableAmount>",
  );
  const invoice = parseUblInvoice(matching);
  assert.equal(invoice.totals.prepaid, 38);
  assert.equal(invoice.totals.due, 200);
  assert.deepEqual(checkInvoice(invoice), []);

  const mismatched = UBL_VALID.replace(
    "<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>",
    "<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount><cbc:PayableAmount>200</cbc:PayableAmount>",
  );
  const errors = checkInvoice(parseUblInvoice(mismatched));
  assert.ok(errors.some((error) => error.rule === "INV-029"));
});

test("UBL payee account and branch map into payment IBAN and BIC", () => {
  const source = UBL_VALID.replace(
    "</cac:AccountingCustomerParty>",
    `</cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>COBADEFFXXX</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`,
  );
  const invoice = parseUblInvoice(source);
  assert.deepEqual(invoice.payment, {
    means: "30",
    remittance: "RF18539007547034",
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
  });
  assert.deepEqual(checkInvoice(invoice), []);
});

test("UBL PartyTaxScheme CompanyID maps into vat_id", () => {
  const source = UBL_VALID.replace(
    "<cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>",
    `<cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>DE136695976</cbc:CompanyID></cac:PartyTaxScheme>`,
  );
  const invoice = parseUblInvoice(source);
  assert.equal(invoice.supplier.vat_id, "DE136695976");
  assert.deepEqual(checkInvoice(invoice), []);
});

test("UBL transposed IBAN becomes INV-025 without echoing the account", () => {
  const source = UBL_VALID.replace(
    "</cac:AccountingCustomerParty>",
    `</cac:AccountingCustomerParty>
  <cac:PaymentMeans><cac:PayeeFinancialAccount>
    <cbc:ID>DE89370400440532013001</cbc:ID>
  </cac:PayeeFinancialAccount></cac:PaymentMeans>`,
  );
  const errors = checkInvoice(parseUblInvoice(source));
  assert.ok(errors.some((error) => error.rule === "INV-025"));
  assert.ok(errors.every((error) => !error.message.includes("32013001")));
});
