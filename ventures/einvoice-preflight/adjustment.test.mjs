import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { headerAdjustmentNetDelta, inspectHeaderAdjustments, normalizeKind } from "./adjustment.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice(overrides = {}) {
  return {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
    ...overrides,
  };
}

function row(overrides = {}) {
  return {
    kind: "allowance",
    amount: 20,
    base: 200,
    percent: 10,
    reason: "Early payment discount",
    ...overrides,
  };
}

const UBL_WITH_ALLOWANCE = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-A</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Early payment discount</cbc:AllowanceChargeReason>
    <cbc:MultiplierFactorNumeric>10</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="EUR">20.00</cbc:Amount>
    <cbc:BaseAmount currencyID="EUR">200.00</cbc:BaseAmount>
  </cac:AllowanceCharge>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
    <cac:AllowanceCharge><cbc:ChargeIndicator>true</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">5.00</cbc:Amount><cbc:AllowanceChargeReason>Line packing</cbc:AllowanceChargeReason></cac:AllowanceCharge>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>180</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>218</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalizeKind accepts allowance, charge, and ChargeIndicator tokens", () => {
  assert.equal(normalizeKind("allowance"), "allowance");
  assert.equal(normalizeKind("Discount"), "allowance");
  assert.equal(normalizeKind("charge"), "charge");
  assert.equal(normalizeKind(false), "allowance");
  assert.equal(normalizeKind(""), null);
});

test("net delta subtracts allowances and adds charges", () => {
  assert.equal(headerAdjustmentNetDelta(invoice({
    adjustments: [row(), row({ kind: "charge", amount: 5, percent: undefined, base: undefined, reason: "Packing" })],
  })), -15);
});

test("omitted adjustments are not a finding", () => {
  assert.deepEqual(inspectHeaderAdjustments(invoice()), []);
});

test("real allowance is clean", () => {
  assert.deepEqual(inspectHeaderAdjustments(invoice({ adjustments: [row()] })), []);
});

test("missing amount is INV-050", () => {
  const findings = inspectHeaderAdjustments(invoice({ adjustments: [row({ amount: "" })] }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-050"]);
  assert.equal(findings[0].path, "/adjustments/0/amount");
});

test("unknown kind is INV-050 and does not echo", () => {
  const findings = inspectHeaderAdjustments(invoice({ adjustments: [row({ kind: "fee-X99" })] }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-050"]);
  assert.equal(findings[0].message.includes("fee-X99"), false);
});

test("percent mismatch is INV-051", () => {
  const findings = inspectHeaderAdjustments(invoice({ adjustments: [row({ amount: 15 })] }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-051"]);
  assert.equal(findings[0].path, "/adjustments/0/amount");
  assert.match(findings[0].fix, /20\.00/);
  assert.equal(findings[0].message.includes("15"), false);
});

test("missing reason is INV-052", () => {
  const findings = inspectHeaderAdjustments(invoice({ adjustments: [{ kind: "allowance", amount: 20 }] }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-052"]);
});

test("placeholder reason is INV-052 and does not echo", () => {
  const findings = inspectHeaderAdjustments(invoice({ adjustments: [row({ reason: "N/A" })] }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-052"]);
  assert.equal(findings[0].message.includes("N/A"), false);
});

test("invoice without adjustments stays clean", () => {
  assert.deepEqual(checkInvoice(invoice()), []);
});

test("good allowance keeps a clean invoice clean", () => {
  assert.deepEqual(checkInvoice(invoice({
    adjustments: [row()],
    totals: { net: 180, tax: 38, gross: 218 },
  })), []);
});

test("forgotten net reduction is INV-014", () => {
  const errors = checkInvoice(invoice({ adjustments: [row()] }));
  assert.ok(errors.some((item) => item.rule === "INV-014"));
  assert.ok(errors.some((item) => item.message.includes("after header allowances")));
});

test("percent mismatch fails preflight", () => {
  const errors = checkInvoice(invoice({
    adjustments: [row({ amount: 15 })],
    totals: { net: 185, tax: 38, gross: 223 },
  }));
  assert.ok(errors.some((item) => item.rule === "INV-051"));
});

test("UBL maps invoice-level allowance and ignores line charge", () => {
  const mapped = parseUblInvoice(UBL_WITH_ALLOWANCE);
  assert.deepEqual(mapped.adjustments, [{
    kind: "allowance",
    amount: 20,
    base: 200,
    percent: 10,
    reason: "Early payment discount",
  }]);
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL percent mismatch is INV-051", () => {
  const mapped = parseUblInvoice(UBL_WITH_ALLOWANCE.replace(">20.00<", ">15.00<"));
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-051" && item.path === "/adjustments/0/amount"));
  assert.ok(errors.every((item) => !item.message.includes("15")));
});

test("UBL placeholder reason is INV-052", () => {
  const mapped = parseUblInvoice(UBL_WITH_ALLOWANCE.replace("Early payment discount", "none"));
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-052" && item.path === "/adjustments/0/reason"));
  assert.ok(errors.every((item) => !item.message.includes("none")));
});

test("UBL without header allowance stays clean", () => {
  const mapped = parseUblInvoice(
    UBL_WITH_ALLOWANCE
      .replace(`  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Early payment discount</cbc:AllowanceChargeReason>
    <cbc:MultiplierFactorNumeric>10</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="EUR">20.00</cbc:Amount>
    <cbc:BaseAmount currencyID="EUR">200.00</cbc:BaseAmount>
  </cac:AllowanceCharge>
`, "")
      .replace(
        "<cbc:TaxExclusiveAmount>180</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>218</cbc:TaxInclusiveAmount>",
        "<cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>",
      ),
  );
  assert.equal("adjustments" in mapped, false);
  assert.deepEqual(checkInvoice(mapped), []);
});
