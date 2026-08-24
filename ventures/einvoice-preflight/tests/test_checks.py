import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_tax_total_must_match_line_tax_percentages(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["tax"] = 0
        invoice["totals"]["gross"] = 200
        errors = check_invoice(invoice)
        rules = {error["rule"] for error in errors}
        self.assertIn("INV-018", rules)
        self.assertTrue(any("line tax percentages" in error["message"] for error in errors))

    def test_tax_total_rounds_each_line_to_cents(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["lines"] = [
            {"description": "A", "quantity": 1, "unit_price": 0.03, "tax_percent": 19, "net": 0.03},
            {"description": "B", "quantity": 1, "unit_price": 0.03, "tax_percent": 19, "net": 0.03},
        ]
        invoice["totals"] = {"net": 0.06, "tax": 0.02, "gross": 0.08}
        self.assertEqual(check_invoice(invoice), [])

    def test_line_net_is_required(self):
        invoice = json.loads(json.dumps(VALID))
        del invoice["lines"][0]["net"]
        errors = check_invoice(invoice)
        self.assertIn("INV-012", {error["rule"] for error in errors})
        self.assertTrue(any("missing" in error["message"] for error in errors))

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

    def test_cli_emits_markdown_review_report(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "markdown"]), 1)
            report = output.getvalue()
            self.assertIn("# E-invoice preflight: Needs review", report)
            self.assertIn("## INV-017", report)
            self.assertIn("**Fix:** Set gross total to 238.00", report)

    def test_cli_emits_markdown_success_report(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "markdown"]), 0)
            self.assertIn("# E-invoice preflight: Pass", output.getvalue())
            self.assertIn("No defects found", output.getvalue())

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

    def test_cli_reads_valid_invoice_from_stdin(self):
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO(json.dumps(VALID))), contextlib.redirect_stdout(output):
            self.assertEqual(main(["-", "--format", "json"]), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "pass")

    def test_cli_labels_stdin_in_sarif_and_keeps_failure_exit(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["gross"] = 200
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO(json.dumps(invoice))), contextlib.redirect_stdout(output):
            self.assertEqual(main(["-", "--format", "sarif"]), 1)
        report = json.loads(output.getvalue())
        location = report["runs"][0]["results"][0]["locations"][0]
        self.assertEqual(location["physicalLocation"]["artifactLocation"]["uri"], "stdin.json")

    def test_cli_returns_read_error_for_malformed_stdin(self):
        with patch("sys.stdin", io.StringIO("not json")):
            self.assertEqual(main(["-", "--format", "json"]), 2)


if __name__ == "__main__":
    unittest.main()
