"""Baisa line nets summed at stated precision, and PINT Oman's line VAT (BTOM-016).

Mirror of baisa.test.mjs: thirty made-up 0.047 OMR lines sum to 1.41 (not 30 x 0.05),
and a tax total that is the sum of the lines' own VAT (0.06; Oman's ALIGNED-IBRP-S-09-OM)
is accepted beside rate x summed taxable (0.07).
"""

from __future__ import annotations

import unittest

from einvoice_preflight.breakdown import inspect_tax_breakdown
from einvoice_preflight.checks import check_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

ARITHMETIC = {"INV-012", "INV-014", "INV-017", "INV-018", "INV-038"}


def omr_invoice(lines: int = 30, net: str = "0.047", line_tax: str | None = "0.002", total: str = "1.41", tax: str = "0.06", taxable: str | None = None) -> str:
    taxable = taxable or total
    gross = f"{float(total) + float(tax):.2f}"
    extension = "" if line_tax is None else (
        f'<cac:ItemPriceExtension><cbc:Amount currencyID="OMR">{float(net) + float(line_tax):.3f}</cbc:Amount>'
        f'<cac:TaxTotal><cbc:TaxAmount currencyID="OMR">{line_tax}</cbc:TaxAmount></cac:TaxTotal></cac:ItemPriceExtension>'
    )
    category = '<cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>'
    body = "".join(
        f'<cac:InvoiceLine><cbc:ID>{i}</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>'
        f'<cbc:LineExtensionAmount currencyID="OMR">{net}</cbc:LineExtensionAmount>'
        f'<cac:Item><cbc:Name>Sample item {i}</cbc:Name><cac:ClassifiedTaxCategory>{category}</cac:ClassifiedTaxCategory></cac:Item>'
        f'<cac:Price><cbc:PriceAmount currencyID="OMR">{net}</cbc:PriceAmount></cac:Price>{extension}</cac:InvoiceLine>'
        for i in range(1, lines + 1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:peppol:pint:billing-1@om-1</cbc:CustomizationID>
<cbc:ID>INV-OM-BAISA-1</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate>
<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Sample Supplier LLC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Sample Buyer SAOC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="OMR">{tax}</cbc:TaxAmount><cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="OMR">{taxable}</cbc:TaxableAmount><cbc:TaxAmount currencyID="OMR">{tax}</cbc:TaxAmount>
<cac:TaxCategory>{category}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="OMR">{total}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="OMR">{total}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="OMR">{gross}</cbc:TaxInclusiveAmount>
<cbc:PayableAmount currencyID="OMR">{gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>{body}
</Invoice>"""


def arithmetic(xml: str) -> list[str]:
    invoice = parse_ubl_invoice(xml)
    ids = {f["rule"] for f in check_invoice(invoice)} | {f["rule"] for f in inspect_tax_breakdown(invoice)}
    return sorted(ids & ARITHMETIC)


class BaisaTest(unittest.TestCase):
    def test_baisa_lines_sum_at_stated_precision(self) -> None:
        self.assertEqual(arithmetic(omr_invoice()), [])

    def test_line_vat_is_read(self) -> None:
        invoice = parse_ubl_invoice(omr_invoice(lines=2))
        self.assertAlmostEqual(float(invoice["lines"][0]["tax_amount"]), 0.002)
        self.assertAlmostEqual(float(invoice["totals"]["tax"]), 0.06)

    def test_rate_times_taxable_still_accepted(self) -> None:
        self.assertEqual(arithmetic(omr_invoice(tax="0.07")), [])

    def test_neither_reading_blocks(self) -> None:
        self.assertEqual(arithmetic(omr_invoice(tax="0.05")), ["INV-018", "INV-038"])

    def test_wrong_net_total_blocks(self) -> None:
        self.assertEqual(arithmetic(omr_invoice(total="1.50", taxable="1.41")), ["INV-014"])

    def test_implausible_line_vat_is_not_summed(self) -> None:
        self.assertEqual(arithmetic(omr_invoice(line_tax="0.020", tax="0.60")), ["INV-018", "INV-038"])

    def test_no_line_vat_no_line_sum(self) -> None:
        self.assertEqual(arithmetic(omr_invoice(line_tax=None)), ["INV-018", "INV-038"])
        self.assertEqual(arithmetic(omr_invoice(line_tax=None, tax="0.07")), [])


if __name__ == "__main__":
    unittest.main()
