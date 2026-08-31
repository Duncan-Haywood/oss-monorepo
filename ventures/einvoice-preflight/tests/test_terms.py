import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.formats import parse_cii_invoice
from einvoice_preflight.terms import inspect_payment_terms, parse_terms_days
from einvoice_preflight.ubl import parse_ubl_invoice


def _invoice(payment=None, include_payment=True, due_date="2026-09-23", issue_date="2026-08-24"):
    invoice = {
        "invoice_number": "INV-1",
        "issue_date": issue_date,
        "currency": "EUR",
        "supplier": {"id": "S1", "name": "Supplier GmbH"},
        "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    if due_date is not None:
        invoice["due_date"] = due_date
    if include_payment:
        invoice["payment"] = payment
    return invoice


UBL_WITH_TERMS = b'''<?xml version="1.0" encoding="UTF-8"?>
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
</Invoice>'''

CII_WITH_TERMS = b'''<?xml version="1.0" encoding="UTF-8"?>
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
</rsm:CrossIndustryInvoice>'''


class TermsHelpersTest(unittest.TestCase):
    def test_parse_terms_days_accepts_int_and_text(self):
        self.assertEqual(parse_terms_days(30), 30)
        self.assertEqual(parse_terms_days(" 14 "), 14)
        self.assertEqual(parse_terms_days(30.0), 30)
        self.assertIsNone(parse_terms_days(""))
        self.assertIsNone(parse_terms_days(None))
        self.assertIsNone(parse_terms_days(True))
        self.assertIsNone(parse_terms_days(0))
        self.assertIsNone(parse_terms_days(-1))
        self.assertIsNone(parse_terms_days("30.5"))
        self.assertIsNone(parse_terms_days("Net 30"))


class TermsRuleTest(unittest.TestCase):
    def test_omitted_terms_is_not_a_finding(self):
        self.assertEqual(inspect_payment_terms(_invoice(include_payment=False)), [])
        self.assertEqual(inspect_payment_terms(_invoice({})), [])
        self.assertEqual(inspect_payment_terms(_invoice({"iban": "DE89370400440532013000"})), [])

    def test_matching_terms_and_due_date_is_clean(self):
        self.assertEqual(inspect_payment_terms(_invoice({"terms_days": 30})), [])
        self.assertEqual(inspect_payment_terms(_invoice({"terms_days": "30"})), [])

    def test_terms_without_due_date_is_clean(self):
        self.assertEqual(inspect_payment_terms(_invoice({"terms_days": 30}, due_date=None)), [])
        invoice = _invoice({"terms_days": 30})
        invoice["due_date"] = ""
        self.assertEqual(inspect_payment_terms(invoice), [])

    def test_empty_terms_is_inv_053(self):
        findings = inspect_payment_terms(_invoice({"terms_days": ""}))
        self.assertEqual([item["rule"] for item in findings], ["INV-053"])
        self.assertEqual(findings[0]["path"], "/payment/terms_days")

    def test_invalid_terms_is_inv_053_and_does_not_echo(self):
        findings = inspect_payment_terms(_invoice({"terms_days": "Net30"}))
        self.assertEqual([item["rule"] for item in findings], ["INV-053"])
        self.assertEqual(findings[0]["path"], "/payment/terms_days")
        self.assertNotIn("Net30", findings[0]["message"])
        self.assertNotIn("Net30", findings[0]["fix"])

    def test_zero_terms_is_inv_053(self):
        findings = inspect_payment_terms(_invoice({"terms_days": 0}))
        self.assertEqual([item["rule"] for item in findings], ["INV-053"])

    def test_mismatch_is_inv_054_and_names_expected_date(self):
        findings = inspect_payment_terms(_invoice({"terms_days": 14}))
        self.assertEqual([item["rule"] for item in findings], ["INV-054"])
        self.assertEqual(findings[0]["path"], "/due_date")
        self.assertIn("2026-09-07", findings[0]["fix"])
        self.assertNotIn("Supplier GmbH", findings[0]["message"])
        self.assertNotIn("Customer GmbH", findings[0]["fix"])


class TermsInvoiceIntegrationTest(unittest.TestCase):
    def test_invoice_without_terms_stays_clean(self):
        self.assertEqual(check_invoice(_invoice(include_payment=False)), [])

    def test_matching_terms_keeps_a_clean_invoice_clean(self):
        self.assertEqual(check_invoice(_invoice({"terms_days": 30})), [])

    def test_mismatch_fails_preflight(self):
        errors = check_invoice(_invoice({"terms_days": 14}))
        self.assertTrue(any(item["rule"] == "INV-054" for item in errors))
        self.assertTrue(any(item["path"] == "/due_date" for item in errors))

    def test_ubl_maps_settlement_period_days(self):
        invoice = parse_ubl_invoice(UBL_WITH_TERMS)
        self.assertEqual(invoice["payment"]["terms_days"], "30")
        self.assertEqual(invoice["due_date"], "2026-09-23")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_terms_mismatch_is_inv_054(self):
        source = UBL_WITH_TERMS.replace(b"<cbc:DueDate>2026-09-23</cbc:DueDate>", b"<cbc:DueDate>2026-08-31</cbc:DueDate>")
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["payment"]["terms_days"], "30")
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-054" and item["path"] == "/due_date" for item in errors))
        self.assertTrue(any("2026-09-23" in item["fix"] for item in errors))

    def test_ubl_terms_without_due_date_stays_clean(self):
        source = UBL_WITH_TERMS.replace(b"<cbc:DueDate>2026-09-23</cbc:DueDate>", b"")
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("due_date", invoice)
        self.assertEqual(invoice["payment"]["terms_days"], "30")
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_without_duration_stays_clean(self):
        source = UBL_WITH_TERMS.replace(
            b"""  <cac:PaymentTerms>
    <cac:SettlementPeriod>
      <cbc:DurationMeasure unitCode="DAY">30</cbc:DurationMeasure>
    </cac:SettlementPeriod>
  </cac:PaymentTerms>
""",
            b"",
        )
        invoice = parse_ubl_invoice(source)
        self.assertNotIn("payment", invoice)
        self.assertEqual(check_invoice(invoice), [])

    def test_cii_maps_duration_measure_days(self):
        invoice = parse_cii_invoice(CII_WITH_TERMS)
        self.assertEqual(invoice["payment"]["terms_days"], "30")
        self.assertEqual(invoice["due_date"], "2026-09-23")
        self.assertEqual(check_invoice(invoice), [])

    def test_cii_terms_mismatch_is_inv_054(self):
        source = CII_WITH_TERMS.replace(b">20260923<", b">20260831<")
        invoice = parse_cii_invoice(source)
        errors = check_invoice(invoice)
        self.assertTrue(any(item["rule"] == "INV-054" and item["path"] == "/due_date" for item in errors))

    def test_cli_formats_do_not_print_party_or_invalid_value(self):
        invoice = _invoice({"terms_days": "Net30"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("INV-053", checklist)
            self.assertNotIn("Net30", checklist)

            mismatch = _invoice({"terms_days": 14})
            path.write_text(json.dumps(mismatch))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "json"]), 1)
            report = output.getvalue()
            self.assertIn("INV-054", report)
            self.assertIn("2026-09-07", report)
            self.assertNotIn("Supplier GmbH", report)
            self.assertNotIn("Customer GmbH", report)


if __name__ == "__main__":
    unittest.main()
