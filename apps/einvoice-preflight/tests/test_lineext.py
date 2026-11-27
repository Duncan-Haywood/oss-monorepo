"""INV-060: a PINT line's own VAT and amount with VAT must add up. Mirror of lineext.test.mjs."""

from __future__ import annotations

import unittest
from decimal import Decimal

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.lineext import inspect_line_extension
from einvoice_preflight.ubl import parse_ubl_invoice

AE = "urn:peppol:pint:billing-1@ae-1"
OM = "urn:peppol:pint:billing-1@om-1"


def ubl(vat: str, amount: str) -> str:
    c = 'currencyID="AED"'
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>{AE}</cbc:CustomizationID>
  <cbc:ID>INV-SAMPLE-1</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Seller</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount {c}>50.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount {c}>1000.00</cbc:TaxableAmount><cbc:TaxAmount {c}>50.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount {c}>1000.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount {c}>1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount {c}>1050.00</cbc:TaxInclusiveAmount><cbc:PayableAmount {c}>1050.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount {c}>1000.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Sample</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount {c}>100</cbc:PriceAmount></cac:Price>
    <cac:ItemPriceExtension><cbc:Amount {c}>{amount}</cbc:Amount><cac:TaxTotal><cbc:TaxAmount {c}>{vat}</cbc:TaxAmount></cac:TaxTotal></cac:ItemPriceExtension>
  </cac:InvoiceLine>
</Invoice>"""


def paths(invoice: dict) -> list[str]:
    return [f["path"] for f in check_invoice(invoice) if f["rule"] == "INV-060"]


class LineExtensionTest(unittest.TestCase):
    def test_reader_keeps_amount_with_vat(self) -> None:
        line = parse_ubl_invoice(ubl("50.00", "1050.00"))["lines"][0]
        self.assertEqual(Decimal(str(line["amount_with_vat"])), Decimal("1050"))

    def test_correct_line_draws_nothing(self) -> None:
        self.assertEqual(paths(parse_ubl_invoice(ubl("50.00", "1050.00"))), [])

    def test_wrong_amount_payable(self) -> None:
        self.assertEqual(paths(parse_ubl_invoice(ubl("50.00", "1057.00"))), ["/lines/0/amount_with_vat"])

    def test_wrong_vat_only(self) -> None:
        self.assertEqual(paths(parse_ubl_invoice(ubl("57.00", "1050.00"))), ["/lines/0/tax_amount"])

    def test_four_decimal_line_and_tolerance(self) -> None:
        inv = {"specification_id": AE, "lines": [
            {"net": "999.375", "tax_percent": 5, "tax_category": "S", "tax_amount": "49.9688", "amount_with_vat": "1049.3438"},
            {"net": "95.24", "tax_percent": 5, "tax_category": "S", "tax_amount": "4.76", "amount_with_vat": "100.00"},
        ]}
        self.assertEqual(inspect_line_extension(inv), [])

    def test_reverse_charge_and_exempt(self) -> None:
        inv = {"specification_id": AE, "lines": [
            {"net": 2970, "tax_percent": 5, "tax_category": "AE", "tax_amount": "148.5", "amount_with_vat": "3118.5"},
            {"net": "727.5", "tax_percent": 0, "tax_category": "E", "amount_with_vat": "734.5"},
        ]}
        self.assertEqual([f["path"] for f in inspect_line_extension(inv)],
                         ["/lines/0/tax_amount", "/lines/0/amount_with_vat", "/lines/1/amount_with_vat"])

    def test_oman_and_left_out_profiles(self) -> None:
        line = {"net": "0.047", "tax_percent": 5, "tax_category": "S", "tax_amount": "0.002", "amount_with_vat": "0.149"}
        found = inspect_line_extension({"specification_id": OM, "lines": [line]})
        self.assertEqual(len(found), 1)
        self.assertIn("BTOM-017", found[0]["message"])
        for spec in ("urn:peppol:pint:billing-1@my-1", "urn:cen.eu:en16931:2017"):
            self.assertEqual(inspect_line_extension({"specification_id": spec, "lines": [line]}), [])


if __name__ == "__main__":
    unittest.main()
