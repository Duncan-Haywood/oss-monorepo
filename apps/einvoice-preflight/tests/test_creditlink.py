import json
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.cli import main

SELLER = {"id": "S1", "name": "Supplier GmbH", "vat_id": "DE136695976"}


def invoice(**over):
    base = {
        "invoice_number": "INV-1001", "issue_date": "2026-08-24", "currency": "EUR",
        "supplier": SELLER, "customer": {"id": "C1", "name": "Customer GmbH"},
        "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
        "totals": {"net": 200, "tax": 38, "gross": 238},
    }
    base.update(over)
    return base


def credit(number, net, **over):
    tax = round(net * 19) / 100
    fields = dict(
        invoice_number=number, document_type="credit_note", original_invoice="INV-1001",
        lines=[{"description": "Credit", "quantity": 1, "unit_price": net, "tax_percent": 19, "net": net}],
        totals={"net": net, "tax": tax, "gross": net + tax},
    )
    fields.update(over)
    return invoice(**fields)


def rules(docs):
    with tempfile.TemporaryDirectory() as d:
        for n, doc in enumerate(docs):
            Path(d, f"f{n}.json").write_text(json.dumps(doc))
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            main([d, "--format", "json"])
        data = json.loads(buf.getvalue())
        return [sorted(e["rule"] for e in r["errors"]) for r in sorted(data["reports"], key=lambda r: r["file"])]


class CreditLinkTest(unittest.TestCase):
    def test_partial_credit_clean(self):
        self.assertEqual(rules([invoice(), credit("CN-1", 100)]), [[], []])

    def test_over_credit(self):
        self.assertEqual(rules([invoice(), credit("CN-1", 150), credit("CN-2", 100)]), [[], ["INV-057"], ["INV-057"]])

    def test_exact_credit_ok(self):
        self.assertEqual(rules([invoice(), credit("CN-1", 150), credit("CN-2", 50)]), [[], [], []])

    def test_currency(self):
        self.assertEqual(rules([invoice(), credit("CN-1", 100, currency="USD")]), [[], ["INV-056"]])

    def test_other_seller(self):
        self.assertEqual(rules([invoice(), credit("CN-1", 100, supplier={"id": "S2", "name": "Other"})]), [[], ["INV-058"]])

    def test_original_not_in_batch(self):
        self.assertEqual(rules([credit("CN-1", 999), credit("CN-2", 5, original_invoice="INV-9")]), [[], []])


if __name__ == "__main__":
    unittest.main()
