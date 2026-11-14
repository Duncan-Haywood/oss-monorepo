"""A UAE volume-discount credit note names no preceding invoice (mirror of ae-volume-discount.test.mjs).

PINT AE's ibr-055-ae requires BillingReference on a 381 credit note except when its
header reason code (BTAE-03) is VD, and then forbids it. The credit notes here are
made up from examples/peppol-credit-note.xml.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

from einvoice_preflight.aside import stepped_aside
from einvoice_preflight.ubl import parse_ubl_invoice

BASE = (Path(__file__).resolve().parents[1] / "examples" / "peppol-credit-note.xml").read_text(encoding="utf-8")
NO_REF = re.sub(r"<cac:BillingReference>[\s\S]*?</cac:BillingReference>", "", BASE, count=1)
AE = "urn:peppol:pint:billing-1@ae-1"


def with_spec(xml: str, spec: str) -> str:
    return re.sub(r"<cbc:CustomizationID>[^<]*", "<cbc:CustomizationID>" + spec, xml, count=1)


def with_reason(xml: str, *codes: str) -> str:
    block = "".join(
        f"<cac:DiscrepancyResponse><cbc:ResponseCode>{c}</cbc:ResponseCode></cac:DiscrepancyResponse>" for c in codes
    )
    return xml.replace("<cbc:BuyerReference>", block + "<cbc:BuyerReference>", 1)


class AeVolumeDiscountTest(unittest.TestCase):
    def test_reader_takes_header_codes_only(self):
        xml = with_reason(NO_REF, "VD", "DL8.61.1.E").replace(
            "<cac:CreditNoteLine>",
            "<cac:CreditNoteLine><cac:DiscrepancyResponse><cbc:ResponseCode>XX</cbc:ResponseCode></cac:DiscrepancyResponse>",
            1,
        )
        self.assertEqual(parse_ubl_invoice(xml)["credit_reason_codes"], ["VD", "DL8.61.1.E"])
        self.assertNotIn("credit_reason_codes", parse_ubl_invoice(BASE))

    def test_vd_under_ae_steps_aside(self):
        self.assertIn("INV-033", stepped_aside(parse_ubl_invoice(with_spec(with_reason(NO_REF, "VD"), AE))))
        self.assertIn("INV-033", stepped_aside(parse_ubl_invoice(with_spec(with_reason(NO_REF, "X", "VD"), AE))))

    def test_otherwise_kept(self):
        self.assertNotIn("INV-033", stepped_aside(parse_ubl_invoice(with_spec(with_reason(NO_REF, "DL8.61.1.E"), AE))))
        self.assertNotIn("INV-033", stepped_aside(parse_ubl_invoice(with_reason(NO_REF, "VD"))))
        self.assertNotIn("INV-033", stepped_aside(parse_ubl_invoice(with_spec(with_reason(NO_REF, "vd"), AE))))
        line_only = with_spec(NO_REF, AE).replace(
            "<cac:CreditNoteLine>",
            "<cac:CreditNoteLine><cac:DiscrepancyResponse><cbc:ResponseCode>VD</cbc:ResponseCode></cac:DiscrepancyResponse>",
            1,
        )
        self.assertNotIn("INV-033", stepped_aside(parse_ubl_invoice(line_only)))


if __name__ == "__main__":
    unittest.main()
