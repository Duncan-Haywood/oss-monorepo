"""The shipped examples are documentation, so they are asserted like code.

`examples/ubl-invoice-with-defects.xml` lists the rule IDs it is meant to
trigger in a comment at the top of the file. A reader trusts that list, and CI
runs the examples, but CI only checks the exit code -- it cannot notice that
the file now trips a different set of rules than the comment claims. These
tests pin the actual rule IDs so the annotation cannot quietly drift away from
what the tool reports.
"""

import json
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.formats import detect_syntax, parse_cii_invoice
from einvoice_preflight.ubl import parse_ubl_invoice

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


def load(name):
    """Read one shipped example the same way the CLI would."""
    raw = (EXAMPLES / name).read_bytes()
    syntax = detect_syntax(raw)
    if syntax == "json":
        return json.loads(raw)
    return parse_cii_invoice(raw) if syntax == "cii" else parse_ubl_invoice(raw)


def rules(document):
    return {finding["rule"] for finding in check_invoice(document)}


class CleanExamplesTest(unittest.TestCase):
    def test_every_clean_example_reports_nothing(self):
        for name in (
            "ubl-invoice.xml",
            "cii-invoice.xml",
            "valid-invoice.json",
            "valid-credit-note.json",
            "valid-mixed-rate.json",
        ):
            with self.subTest(example=name):
                self.assertEqual(check_invoice(load(name)), [])

    def test_the_ubl_example_parses_into_the_parties_it_names(self):
        # Guards the party mapping: the seller's identifier must come from its
        # electronic address, not from the "VAT" tax-scheme name that sits
        # deeper in the same element.
        invoice = load("ubl-invoice.xml")
        self.assertEqual(invoice["supplier"]["name"], "Supplier GmbH")
        self.assertEqual(invoice["supplier"]["id"], "4012345000009")
        self.assertEqual(invoice["supplier"]["vat_id"], "DE136695976")
        self.assertEqual(invoice["customer"]["name"], "Customer AG")
        self.assertEqual(invoice["customer"]["id"], "4098765000003")

    def test_the_ubl_example_carries_two_vat_rates(self):
        invoice = load("ubl-invoice.xml")
        self.assertEqual(
            sorted(str(row["tax_percent"]) for row in invoice["tax_breakdown"]), ["19", "7"]
        )


class DefectiveExampleTest(unittest.TestCase):
    def setUp(self):
        self.document = load("ubl-invoice-with-defects.xml")

    def test_it_reports_exactly_the_rules_its_comment_documents(self):
        self.assertEqual(
            rules(self.document),
            {"INV-017", "INV-018", "INV-021", "INV-029", "INV-038", "INV-045"},
        )

    def test_the_comment_at_the_top_of_the_file_lists_those_same_rules(self):
        # The annotation is the part a human reads; keep it honest.
        header = (EXAMPLES / "ubl-invoice-with-defects.xml").read_text().split("-->")[0]
        for rule in rules(self.document):
            self.assertIn(rule, header)

    def test_findings_state_the_corrected_figure(self):
        fixes = {finding["rule"]: finding["fix"] for finding in check_invoice(self.document)}
        # A bookkeeper should not have to redo the arithmetic to act on this.
        self.assertIn("38.00", fixes["INV-038"])
        self.assertIn("48.50", fixes["INV-018"])
        self.assertIn("396.60", fixes["INV-017"])

    def test_it_differs_from_the_clean_example_only_by_planted_defects(self):
        # If the two files drift apart structurally, the defective one stops
        # demonstrating "the same invoice, but wrong".
        clean = load("ubl-invoice.xml")
        self.assertEqual(len(clean["lines"]), len(self.document["lines"]))
        self.assertEqual(clean["supplier"], self.document["supplier"])
        self.assertEqual(clean["totals"]["net"], self.document["totals"]["net"])


if __name__ == "__main__":
    unittest.main()
