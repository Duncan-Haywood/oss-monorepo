"""INV-062 reads XML files in the CLI, not only JSON invoices.

Until 2026-11-17 the Python readers (ubl.py, formats.py) dropped a party's
legal_id and party_ids, and the CII reader its endpoint, so endpoint.py's
INV-062 (and, for CII, INV-041) could only fire on a hand-written JSON
invoice. The page's readers (ubl.mjs, cii.mjs) fill all three; on the 34
UBL/CII files in this venture the two sides disagreed on 24 before this change
and on none after (eval/py-js-party-readers.mjs).
"""

import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.formats import parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

ROOT = Path(__file__).resolve().parents[1]
CAC = 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
CBC = 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'


def ubl(supplier_extra: str) -> bytes:
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" {CAC} {CBC}>
  <cbc:ID>INV-1</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>{supplier_extra}
    <cac:PartyName><cbc:Name>Seller</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>B-1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Work</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''.encode()


def rules(invoice):
    return [(f["rule"], f["path"]) for f in check_invoice(invoice)]


class UblPartyIdsTest(unittest.TestCase):
    def test_legal_id_with_a_bad_belgian_number_is_inv_062(self):
        # 0208 is a Belgian enterprise number: ten digits, no dots (PEPPOL-COMMON-R043).
        bad = ubl('<cac:PartyLegalEntity><cbc:RegistrationName>S</cbc:RegistrationName>'
                  '<cbc:CompanyID schemeID="0208">0403.170.701</cbc:CompanyID></cac:PartyLegalEntity>')
        invoice = parse_ubl_invoice(bad)
        self.assertEqual(invoice["supplier"]["legal_id"], {"id": "0403.170.701", "scheme": "0208"})
        self.assertIn(("INV-062", "/supplier/legal_id/id"), rules(invoice))
        good = parse_ubl_invoice(bad.replace(b"0403.170.701", b"0403170701"))
        self.assertNotIn("INV-062", [rule for rule, _ in rules(good)])

    def test_party_identification_with_a_scheme_is_inv_062(self):
        invoice = parse_ubl_invoice(ubl(
            '<cac:PartyIdentification><cbc:ID schemeID="0088">3654789851</cbc:ID></cac:PartyIdentification>'))
        self.assertEqual(invoice["supplier"]["party_ids"], [{"id": "3654789851", "scheme": "0088"}])
        self.assertIn(("INV-062", "/supplier/party_ids/0/id"), rules(invoice))

    def test_an_identifier_without_a_scheme_is_not_a_party_id(self):
        invoice = parse_ubl_invoice(ubl('<cac:PartyIdentification><cbc:ID>S-1</cbc:ID></cac:PartyIdentification>'))
        self.assertNotIn("party_ids", invoice["supplier"])
        self.assertEqual(invoice["supplier"]["id"], "S-1")


class CiiPartyIdsTest(unittest.TestCase):
    def test_fnfe_cii_matches_its_ubl_twin(self):
        # The FNFE use case 1 ships as UBL and CII; both carry 0088 ids that are
        # not 13-digit GLNs, and the page flags both on each side.
        for name in ("uc1-en16931-ubl.xml", "uc1-en16931-cii.xml"):
            raw = (ROOT / "fixtures" / "fr-fnfe" / name).read_bytes()
            invoice = parse_cii_invoice(raw) if name.endswith("cii.xml") else parse_ubl_invoice(raw)
            with self.subTest(name=name):
                self.assertEqual(
                    [p for r, p in rules(invoice) if r == "INV-062"],
                    ["/supplier/party_ids/0/id", "/customer/party_ids/0/id"],
                )

    def test_cii_reader_fills_legal_id_and_endpoint(self):
        raw = (ROOT / "fixtures" / "fr-fnfe" / "uc1-en16931-cii.xml").read_bytes()
        supplier = parse_cii_invoice(raw)["supplier"]
        self.assertIn("legal_id", supplier)
        self.assertIn("endpoint", supplier)
        self.assertTrue(supplier["endpoint"]["id"])


if __name__ == "__main__":
    unittest.main()
