"""INV-062 on the payee (BG-10) and tax representative (BG-11) in the CLI.

OpenPeppol's PEPPOL-COMMON id contexts match PartyIdentification/ID and
CompanyID (UBL) and ID/GlobalID (CII) wherever they sit, so a payee's or tax
representative's mistyped id bounces as the seller's does. The page's readers
keep them as payee_party / tax_representative (ubl.mjs, cii.mjs, checks.mjs);
these readers mirror them. INV-063 stays silent in the CLI, as INV-061 does.
"""

import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.formats import parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

ROOT = Path(__file__).resolve().parents[1]


def id_rules(findings):
    return [(f["rule"], f["path"]) for f in findings if f["rule"] in ("INV-062", "INV-063")]


class SidePartyIds(unittest.TestCase):
    def test_ubl_payee_and_tax_representative(self):
        xml = (ROOT / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8").replace(
            "</cac:AccountingCustomerParty>",
            "</cac:AccountingCustomerParty>"
            '<cac:PayeeParty><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>'
            '<cac:PartyName><cbc:Name>Factor AB</cbc:Name></cac:PartyName>'
            '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0007">5560360793</cbc:CompanyID></cac:PartyLegalEntity></cac:PayeeParty>'
            '<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName>'
            '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0192">981276958</cbc:CompanyID></cac:PartyLegalEntity></cac:TaxRepresentativeParty>',
        )
        invoice = parse_ubl_invoice(xml)
        self.assertEqual(invoice["payee_party"], {"legal_id": {"id": "5560360793", "scheme": "0007"}, "party_ids": [{"id": "4012345000008", "scheme": "0088"}]})
        self.assertEqual(
            id_rules(check_invoice(invoice)),
            [("INV-062", "/payee_party/party_ids/0/id"), ("INV-062", "/tax_representative/legal_id/id")],
        )

    def test_cii_payee_and_tax_representative(self):
        xml = (ROOT / "examples" / "cii-invoice.xml").read_text(encoding="utf-8")
        self.assertNotIn("payee_party", parse_cii_invoice(xml))
        xml = xml.replace(
            "<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>",
            '<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:PayeeTradeParty><ram:GlobalID schemeID="0192">981276958</ram:GlobalID><ram:Name>Factor AB</ram:Name></ram:PayeeTradeParty>',
        ).replace(
            "</ram:BuyerTradeParty>",
            '</ram:BuyerTradeParty><ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0007">5560360793</ram:ID></ram:SpecifiedLegalOrganization></ram:SellerTaxRepresentativeTradeParty>',
        )
        invoice = parse_cii_invoice(xml)
        self.assertEqual(invoice["tax_representative"], {"legal_id": {"id": "5560360793", "scheme": "0007"}})
        self.assertEqual(id_rules(check_invoice(invoice)), [("INV-062", "/payee_party/party_ids/0/id")])


    def test_ubl_delivery_party(self):
        xml = (ROOT / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8")
        self.assertNotIn("delivery_party", parse_ubl_invoice(xml))
        xml = xml.replace(
            "</cac:AccountingCustomerParty>",
            "</cac:AccountingCustomerParty>"
            '<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:DeliveryLocation>'
            '<cac:DeliveryParty><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>'
            '<cac:PartyName><cbc:Name>Warehouse 3</cbc:Name></cac:PartyName>'
            '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0007">5560360793</cbc:CompanyID></cac:PartyLegalEntity></cac:DeliveryParty></cac:Delivery>',
        )
        invoice = parse_ubl_invoice(xml)
        self.assertEqual(invoice["delivery_party"], {"legal_id": {"id": "5560360793", "scheme": "0007"}, "party_ids": [{"id": "4012345000008", "scheme": "0088"}]})
        self.assertEqual(id_rules(check_invoice(invoice)), [("INV-062", "/delivery_party/party_ids/0/id")])

    def test_cii_ship_to_party(self):
        xml = (ROOT / "examples" / "cii-invoice.xml").read_text(encoding="utf-8").replace(
            "<ram:ApplicableHeaderTradeDelivery/>",
            '<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:ID schemeID="0088">4012345000009</ram:ID>'
            '<ram:Name>Warehouse 3</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0007">5560360794</ram:ID>'
            "</ram:SpecifiedLegalOrganization></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>",
        )
        invoice = parse_cii_invoice(xml)
        self.assertEqual(invoice["delivery_party"], {"legal_id": {"id": "5560360794", "scheme": "0007"}, "party_ids": [{"id": "4012345000009", "scheme": "0088"}]})
        self.assertEqual(id_rules(check_invoice(invoice)), [("INV-062", "/delivery_party/legal_id/id")])


    def test_cii_line_item_id_under_a_common_scheme(self):
        xml = (ROOT / "examples" / "cii-invoice.xml").read_text(encoding="utf-8").replace(
            "<ram:SpecifiedTradeProduct><ram:Name>",
            '<ram:SpecifiedTradeProduct><ram:GlobalID schemeID="0088">4012345000008</ram:GlobalID><ram:Name>',
        )
        self.assertEqual(id_rules(check_invoice(parse_cii_invoice(xml))), [("INV-062", "/lines/0/scheme_ids/0/id")])
        ok = xml.replace('schemeID="0088">4012345000008', 'schemeID="0160">4012345000008')
        self.assertEqual(id_rules(check_invoice(parse_cii_invoice(ok))), [])

    def test_ubl_line_delivery_party(self):
        xml = (ROOT / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8").replace(
            '<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>\n    <cac:Item>',
            '<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cac:Delivery><cac:DeliveryParty>'
            '<cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>'
            "</cac:DeliveryParty></cac:Delivery>\n    <cac:Item>",
        )
        invoice = parse_ubl_invoice(xml)
        self.assertEqual(invoice["lines"][0]["scheme_ids"], [{"id": "4012345000008", "scheme": "0088"}])
        self.assertEqual(id_rules(check_invoice(invoice)), [("INV-062", "/lines/0/scheme_ids/0/id")])
        ok = xml.replace('schemeID="0088">4012345000008', 'schemeID="0088">4012345000009')
        self.assertEqual(id_rules(check_invoice(parse_ubl_invoice(ok))), [])


if __name__ == "__main__":
    unittest.main()
