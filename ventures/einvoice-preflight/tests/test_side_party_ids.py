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


if __name__ == "__main__":
    unittest.main()
