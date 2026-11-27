import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectPaymentTerms, parseTermsDays } from "./terms.mjs";
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";

function invoice(payment, options = {}) {
  const { includePayment = true, due_date = "2026-09-23", issue_date = "2026-08-24" } = options;
  const document = {
    invoice_number: "INV-1",
    issue_date,
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  if (due_date !== null) document.due_date = due_date;
  if (includePayment) document.payment = payment;
  return document;
}

const UBL_WITH_TERMS = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-T</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DueDate>2026-09-23</cbc:DueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentTerms>
    <cac:SettlementPeriod>
      <cbc:DurationMeasure unitCode="DAY">30</cbc:DurationMeasure>
    </cac:SettlementPeriod>
  </cac:PaymentTerms>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

const CII_WITH_TERMS = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
 xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
 xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>INV-CII-T</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20260824</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Work</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>100.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:RateApplicablePercent>19</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>200.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:ID>S1</ram:ID><ram:Name>Supplier</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:ID>C1</ram:ID><ram:Name>Customer</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery></ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>38.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>200.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">20260923</udt:DateTimeString></ram:DueDateDateTime>
        <ram:SpecifiedPeriod>
          <ram:DurationMeasure unitCode="DAY">30</ram:DurationMeasure>
        </ram:SpecifiedPeriod>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>200.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>200.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">38.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>238.00</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

test("parseTermsDays accepts int and text", () => {
  assert.equal(parseTermsDays(30), 30);
  assert.equal(parseTermsDays(" 14 "), 14);
  assert.equal(parseTermsDays(""), null);
  assert.equal(parseTermsDays(null), null);
  assert.equal(parseTermsDays(true), null);
  assert.equal(parseTermsDays(0), null);
  assert.equal(parseTermsDays(-1), null);
  assert.equal(parseTermsDays("Net 30"), null);
});

test("omitted terms is not a finding", () => {
  assert.deepEqual(inspectPaymentTerms(invoice(undefined, { includePayment: false })), []);
  assert.deepEqual(inspectPaymentTerms(invoice({})), []);
  assert.deepEqual(inspectPaymentTerms(invoice({ iban: "DE89370400440532013000" })), []);
});

test("matching terms and due date is clean", () => {
  assert.deepEqual(inspectPaymentTerms(invoice({ terms_days: 30 })), []);
  assert.deepEqual(inspectPaymentTerms(invoice({ terms_days: "30" })), []);
});

test("terms without due date is clean", () => {
  assert.deepEqual(inspectPaymentTerms(invoice({ terms_days: 30 }, { due_date: null })), []);
  const document = invoice({ terms_days: 30 });
  document.due_date = "";
  assert.deepEqual(inspectPaymentTerms(document), []);
});

test("empty terms is INV-053", () => {
  const findings = inspectPaymentTerms(invoice({ terms_days: "" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-053"]);
  assert.equal(findings[0].path, "/payment/terms_days");
});

test("invalid terms is INV-053 and does not echo", () => {
  const findings = inspectPaymentTerms(invoice({ terms_days: "Net30" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-053"]);
  assert.equal(findings[0].path, "/payment/terms_days");
  assert.ok(!findings[0].message.includes("Net30"));
  assert.ok(!findings[0].fix.includes("Net30"));
});

test("mismatch is INV-054 and names expected date", () => {
  const findings = inspectPaymentTerms(invoice({ terms_days: 14 }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-054"]);
  assert.equal(findings[0].path, "/due_date");
  assert.ok(findings[0].fix.includes("2026-09-07"));
  assert.ok(!findings[0].message.includes("Supplier GmbH"));
});

test("invoice without terms stays clean", () => {
  assert.deepEqual(checkInvoice(invoice(undefined, { includePayment: false })), []);
});

test("matching terms keeps a clean invoice clean", () => {
  assert.deepEqual(checkInvoice(invoice({ terms_days: 30 })), []);
});

test("mismatch fails preflight", () => {
  const errors = checkInvoice(invoice({ terms_days: 14 }));
  assert.ok(errors.some((item) => item.rule === "INV-054"));
  assert.ok(errors.some((item) => item.path === "/due_date"));
});

test("UBL maps settlement period days", () => {
  const mapped = parseUblInvoice(UBL_WITH_TERMS);
  assert.equal(mapped.payment.terms_days, "30");
  assert.equal(mapped.due_date, "2026-09-23");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL terms mismatch is INV-054", () => {
  const mapped = parseUblInvoice(UBL_WITH_TERMS.replace("2026-09-23", "2026-08-31"));
  assert.equal(mapped.payment.terms_days, "30");
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-054" && item.path === "/due_date"));
  assert.ok(errors.some((item) => item.fix.includes("2026-09-23")));
});

test("UBL terms without due date stays clean", () => {
  const mapped = parseUblInvoice(UBL_WITH_TERMS.replace("<cbc:DueDate>2026-09-23</cbc:DueDate>", ""));
  assert.ok(!("due_date" in mapped));
  assert.equal(mapped.payment.terms_days, "30");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("CII maps duration measure days", () => {
  const mapped = parseCiiInvoice(CII_WITH_TERMS);
  assert.equal(mapped.payment.terms_days, "30");
  assert.equal(mapped.due_date, "2026-09-23");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("CII terms mismatch is INV-054", () => {
  const mapped = parseCiiInvoice(CII_WITH_TERMS.replace("20260923", "20260831"));
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-054" && item.path === "/due_date"));
});
