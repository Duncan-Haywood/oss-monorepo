"""BT-63, the tax representative's VAT number, in the CLI (INV-022/023).

The page's readers keep it as tax_representative.vat_id (ubl.mjs, cii.mjs) and
checks.mjs runs the seller's VAT checks on it; these readers mirror that.
INV-064 (PEPPOL-COMMON-R056-2's shape, a warning) stays silent in the CLI, as
INV-061 does: it has no warning severity.
"""

import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.formats import parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

ROOT = Path(__file__).resolve().parents[1]
UBL = (ROOT / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8")
CII = (ROOT / "examples" / "cii-invoice.xml").read_text(encoding="utf-8")


def ubl_rep(vat):
    return UBL.replace(
        "</cac:AccountingCustomerParty>",
        "</cac:AccountingCustomerParty><cac:TaxRepresentativeParty>"
        f"<cac:PartyTaxScheme><cbc:CompanyID>{vat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>"
        "</cac:TaxRepresentativeParty>",
    )


def cii_rep(vat):
    return CII.replace(
        "</ram:BuyerTradeParty>",
        "</ram:BuyerTradeParty><ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name>"
        f'<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">{vat}</ram:ID></ram:SpecifiedTaxRegistration>'
        "</ram:SellerTaxRepresentativeTradeParty>",
    )


def rep_rules(findings):
    return [(f["rule"], f["message"].split(" VAT")[0]) for f in findings if f["path"] == "/tax_representative/vat_id"]


class TaxRepresentativeVat(unittest.TestCase):
    def test_readers_keep_bt63(self):
        self.assertEqual(parse_ubl_invoice(ubl_rep("NL123456782B01"))["tax_representative"], {"vat_id": "NL123456782B01"})
        self.assertEqual(parse_cii_invoice(cii_rep("NL123456782B01"))["tax_representative"], {"vat_id": "NL123456782B01"})

    def test_valid_number_is_silent(self):
        self.assertEqual(rep_rules(check_invoice(parse_ubl_invoice(ubl_rep("NL123456782B01")))), [])
        self.assertEqual(rep_rules(check_invoice(parse_cii_invoice(cii_rep("NL002455799B11")))), [])

    def test_mistyped_number_fails_like_the_sellers(self):
        self.assertEqual(rep_rules(check_invoice(parse_ubl_invoice(ubl_rep("NL123456783B01")))), [("INV-023", "Tax representative")])
        self.assertEqual(rep_rules(check_invoice(parse_cii_invoice(cii_rep("NL12345678B01")))), [("INV-022", "Tax representative")])

    def test_spaced_dutch_number_is_silent_in_the_cli(self):
        self.assertEqual(rep_rules(check_invoice(parse_ubl_invoice(ubl_rep("NL 123456782 B01")))), [])


if __name__ == "__main__":
    unittest.main()
