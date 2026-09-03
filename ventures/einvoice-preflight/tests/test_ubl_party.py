"""How a UBL party's identifier and name are resolved.

Both cases here were live defects. A party identifier was read with a
descendant-wide search for an element named ``ID``, which on any party
carrying ``cac:PartyTaxScheme`` matches ``cac:TaxScheme/cbc:ID`` first and
silently reports the seller's identifier as the string "VAT". And the
identifier was mandatory, so a Peppol invoice that identifies its buyer by
electronic address and name -- which EN 16931 permits, since BT-29 and BT-46
are optional -- was refused as unreadable instead of being checked.
"""

import unittest

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

CAC = 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
CBC = 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"'


def invoice(supplier_party, customer_party):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" {CAC} {CBC}>
  <cbc:ID>INV-1</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>{supplier_party}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>{customer_party}</cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Work</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''.encode()


WITH_TAX_SCHEME = '''<cac:Party>
  <cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>
  <cac:PartyName><cbc:Name>Supplier GmbH</cbc:Name></cac:PartyName>
  <cac:PartyTaxScheme><cbc:CompanyID>DE136695976</cbc:CompanyID>
    <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
</cac:Party>'''

ENDPOINT_AND_NAME_ONLY = '''<cac:Party>
  <cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>
  <cac:PartyName><cbc:Name>Customer AG</cbc:Name></cac:PartyName>
</cac:Party>'''

EXPLICIT_IDENTIFICATION = '''<cac:Party>
  <cac:PartyIdentification><cbc:ID>CUST-7</cbc:ID></cac:PartyIdentification>
  <cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>
  <cac:PartyName><cbc:Name>Customer AG</cbc:Name></cac:PartyName>
</cac:Party>'''

LEGAL_ENTITY_NAME_ONLY = '''<cac:Party>
  <cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>
  <cac:PartyLegalEntity><cbc:RegistrationName>Customer AG</cbc:RegistrationName>
    <cbc:CompanyID>HRB 1234</cbc:CompanyID></cac:PartyLegalEntity>
</cac:Party>'''


class PartyIdentifierTest(unittest.TestCase):
    def test_a_tax_scheme_name_is_never_the_party_identifier(self):
        supplier = parse_ubl_invoice(invoice(WITH_TAX_SCHEME, ENDPOINT_AND_NAME_ONLY))["supplier"]
        self.assertNotEqual(supplier["id"], "VAT")
        self.assertEqual(supplier["id"], "4012345000009")
        self.assertEqual(supplier["vat_id"], "DE136695976")

    def test_a_party_identified_only_by_electronic_address_is_readable(self):
        # Previously raised ValueError("UBL field ID is missing"), which the
        # CLI surfaces as "could not read invoice" -- the whole document lost
        # over an element EN 16931 does not require.
        document = parse_ubl_invoice(invoice(WITH_TAX_SCHEME, ENDPOINT_AND_NAME_ONLY))
        self.assertEqual(document["customer"]["id"], "4098765000003")
        self.assertEqual(document["customer"]["name"], "Customer AG")
        self.assertEqual(check_invoice(document), [])

    def test_an_explicit_party_identification_wins_over_the_endpoint(self):
        document = parse_ubl_invoice(invoice(WITH_TAX_SCHEME, EXPLICIT_IDENTIFICATION))
        self.assertEqual(document["customer"]["id"], "CUST-7")

    def test_no_identifier_at_all_becomes_a_finding_not_an_unreadable_file(self):
        # The distinction the tool is built on: "this invoice has a defect"
        # (exit 1, with the defect named) beats "I could not read this file"
        # (exit 2, with nothing checked).
        name_only = "<cac:Party><cac:PartyName><cbc:Name>Customer AG</cbc:Name>" "</cac:PartyName></cac:Party>"
        document = parse_ubl_invoice(invoice(WITH_TAX_SCHEME, name_only))
        self.assertEqual(document["customer"]["id"], "")
        self.assertIn("INV-005", {finding["rule"] for finding in check_invoice(document)})

    def test_a_legal_registration_name_can_stand_in_for_the_party_name(self):
        # XRechnung carries the legal name here and may omit PartyName.
        document = parse_ubl_invoice(invoice(WITH_TAX_SCHEME, LEGAL_ENTITY_NAME_ONLY))
        self.assertEqual(document["customer"]["name"], "Customer AG")
        self.assertEqual(document["customer"]["id"], "4098765000003")


if __name__ == "__main__":
    unittest.main()
