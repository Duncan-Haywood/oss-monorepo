import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main


VALID = {
    "invoice_number": "INV-1", "issue_date": "2026-08-24", "currency": "EUR",
    "supplier": {"id": "S1", "name": "Supplier"}, "customer": {"id": "C1", "name": "Customer"},
    "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
    "totals": {"net": 200, "tax": 38, "gross": 238},
}


class ChecksTest(unittest.TestCase):
    def test_valid_invoice_passes(self):
        self.assertEqual(check_invoice(VALID), [])

    def test_arithmetic_defect_is_explained(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["gross"] = 200
        errors = check_invoice(invoice)
        self.assertIn("INV-017", {error["rule"] for error in errors})
        self.assertTrue(any("net plus tax" in error["message"] for error in errors))

    def test_missing_fields_and_bad_date_are_not_valid(self):
        errors = check_invoice({"issue_date": "24/08/2026"})
        rules = {error["rule"] for error in errors}
        self.assertIn("INV-001", rules)
        self.assertIn("INV-003", rules)

    def test_cli_writes_only_aggregate_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]), 0)
            self.assertEqual(json.loads(usage_path.read_text()), {"events": {"invoice_preflight_checked": 1}})

    def test_cli_returns_failure_for_bad_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            self.assertEqual(main([str(invoice_path), "--format", "json"]), 1)

    def test_cli_emits_sarif_for_ci_and_editor_integrations(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "sarif"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["version"], "2.1.0")
            result = report["runs"][0]["results"][0]
            self.assertEqual(result["ruleId"], "INV-017")
            self.assertEqual(result["locations"][0]["physicalLocation"]["artifactLocation"]["uri"], "invoice.json")

    def test_cli_emits_empty_sarif_for_valid_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "sarif"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["runs"][0]["results"], [])


if __name__ == "__main__":
    unittest.main()
