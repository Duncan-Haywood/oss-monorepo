import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from einvoice_preflight.checks import check_invoice
from einvoice_preflight.cli import main
from einvoice_preflight.ubl import parse_ubl_invoice


VALID = {
    "invoice_number": "INV-1", "issue_date": "2026-08-24", "currency": "EUR",
    "supplier": {"id": "S1", "name": "Supplier"}, "customer": {"id": "C1", "name": "Customer"},
    "lines": [{"description": "Work", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
    "totals": {"net": 200, "tax": 38, "gross": 238},
}

UBL_VALID = b'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-1</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>'''


class ChecksTest(unittest.TestCase):
    def test_ubl_invoice_maps_to_supported_shape(self):
        self.assertEqual(check_invoice(parse_ubl_invoice(UBL_VALID)), [])

    def test_cli_accepts_ubl_xml_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.xml"
            path.write_bytes(UBL_VALID)
            self.assertEqual(main([str(path), "--format", "json"]), 0)

    def test_ubl_rejects_entity_declarations(self):
        with self.assertRaisesRegex(ValueError, "entity"):
            parse_ubl_invoice(b"<!DOCTYPE Invoice [ <!ENTITY x 'x'> ]>" + UBL_VALID)
    def test_valid_invoice_passes(self):
        self.assertEqual(check_invoice(VALID), [])

    def test_arithmetic_defect_is_explained(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["gross"] = 200
        errors = check_invoice(invoice)
        self.assertIn("INV-017", {error["rule"] for error in errors})
        self.assertTrue(any("net plus tax" in error["message"] for error in errors))
        self.assertEqual(next(error for error in errors if error["rule"] == "INV-017")["path"], "/totals/gross")

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

    def test_cli_ignores_invalid_usage_counter(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            usage_path.write_text(json.dumps({"events": {"invoice_preflight_checked": "unknown"}}))
            self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]), 0)
            self.assertEqual(json.loads(usage_path.read_text()), {"events": {"invoice_preflight_checked": 1}})

    def test_usage_write_failure_does_not_fail_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            with patch("einvoice_preflight.cli.Path.write_text", side_effect=OSError("read-only")):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(Path(directory) / "usage.json")]), 0)

    def test_cli_returns_failure_for_bad_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 1)
            self.assertEqual(report["files_failed"], 1)
            self.assertEqual(report["observations"], 1)
            self.assertEqual(report["reports"][0]["file"], "invoice.json")
            self.assertEqual(report["reports"][0]["status"], "fail")
            self.assertEqual(report["reports"][0]["observations"], 1)
            self.assertEqual(report["reports"][0]["errors"][0]["rule"], "INV-017")

    def test_cli_json_single_file_includes_adapter_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["file"], "invoice.json")
            self.assertEqual(report["files_checked"], 1)
            self.assertEqual(report["files_failed"], 1)
            self.assertEqual(report["observations"], 1)
            self.assertEqual(report["rules"], {"INV-017": 1})
            self.assertEqual(report["errors"][0]["rule"], "INV-017")

    def test_cli_batch_flags_duplicate_invoice_numbers_without_disclosing_number(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = json.loads(json.dumps(VALID))
            second = json.loads(json.dumps(VALID))
            second["lines"][0]["description"] = "Different work"
            (root / "first.json").write_text(json.dumps(first))
            (root / "second.json").write_text(json.dumps(second))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["rules"], {"INV-019": 2})
            self.assertTrue(all(error["path"] == "/invoice_number" for item in report["reports"] for error in item["errors"]))
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_batch_allows_unique_invoice_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = json.loads(json.dumps(VALID))
            second = json.loads(json.dumps(VALID))
            second["invoice_number"] = "INV-2"
            (root / "first.json").write_text(json.dumps(first))
            (root / "second.json").write_text(json.dumps(second))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["rules"], {})

    def test_cli_json_single_file_reports_read_error(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            invoice_path.write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertIsNone(report["file"])
            self.assertEqual(report["files_checked"], 0)
            self.assertEqual(report["read_errors"][0]["file"], "broken.json")

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
            self.assertEqual(result["properties"]["jsonPointer"], "/totals/gross")

    def test_cli_emits_empty_sarif_for_valid_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "sarif"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["runs"][0]["results"], [])

    def test_cli_emits_sarif_result_for_read_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            invoice_path.write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "sarif"]), 2)
            result = json.loads(output.getvalue())["runs"][0]["results"][0]
            self.assertEqual(result["ruleId"], "INV-READ")
            self.assertEqual(result["locations"][0]["physicalLocation"]["artifactLocation"]["uri"], "broken.json")
            self.assertIn("Invoice could not be read", result["message"]["text"])

    def test_cli_emits_github_annotations_without_invoice_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice,review.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "github"]), 1)
            annotation = output.getvalue()
            self.assertIn("::error file=invoice%2Creview.json,line=1,title=INV-017::", annotation)
            self.assertIn("Gross total does not equal net plus tax.", annotation)
            self.assertIn("Fix:", annotation)
            self.assertNotIn("INV-1", annotation)

    def test_cli_emits_github_annotation_for_read_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            invoice_path.write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "github"]), 2)
            self.assertIn("::error file=broken.json,line=1,title=Unreadable invoice::", output.getvalue())

    def test_cli_emits_no_github_annotations_for_valid_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "github"]), 0)
            self.assertEqual(output.getvalue(), "")

    def test_cli_reads_valid_invoice_from_stdin(self):
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO(json.dumps(VALID))), contextlib.redirect_stdout(output):
            self.assertEqual(main(["-", "--format", "json"]), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["status"], "pass")
        self.assertEqual(report["files_checked"], 1)
        self.assertEqual(report["files_failed"], 0)
        self.assertEqual(report["observations"], 0)
        self.assertEqual(report["reports"][0]["file"], "stdin.json")

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

    def test_cli_checks_directory_and_reports_each_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "nested").mkdir()
            (root / "pass.json").write_text(json.dumps(VALID))
            failed = json.loads(json.dumps(VALID))
            failed["invoice_number"] = "INV-2"
            failed["totals"]["gross"] = 200
            (root / "nested" / "fail.json").write_text(json.dumps(failed))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 2)
            self.assertEqual(report["files_failed"], 1)
            self.assertEqual(report["reports"][0]["file"], "nested/fail.json")
            self.assertEqual(report["reports"][1]["file"], "pass.json")
            self.assertEqual(report["reports"][0]["status"], "fail")
            self.assertEqual(report["reports"][0]["observations"], 1)
            self.assertEqual(report["reports"][1]["status"], "pass")
            self.assertEqual(report["reports"][1]["observations"], 0)
            self.assertEqual(report["reports"][0]["errors"][0]["rule"], "INV-017")
            self.assertEqual(report["observations"], 1)
            self.assertEqual(report["rules"], {"INV-017": 1})

    def test_cli_batch_sarif_uses_relative_file_locations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failed = json.loads(json.dumps(VALID))
            failed["totals"]["gross"] = 200
            (root / "fail.json").write_text(json.dumps(failed))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "sarif"]), 1)
            report = json.loads(output.getvalue())
            location = report["runs"][0]["results"][0]["locations"][0]
            self.assertEqual(location["physicalLocation"]["artifactLocation"]["uri"], "fail.json")

    def test_cli_batch_returns_read_error_for_malformed_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 0)
            self.assertEqual(report["read_errors"][0]["file"], "broken.json")

    def test_cli_batch_does_not_follow_symlinked_invoice(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            outside_invoice = Path(outside) / "outside.json"
            outside_invoice.write_text(json.dumps(VALID))
            (root / "linked.json").symlink_to(outside_invoice)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 0)
            self.assertEqual(report["read_errors"], [{
                "file": "linked.json",
                "error": "Refusing to follow symbolic link during directory scan.",
            }])

    def test_cli_emits_markdown_review_for_single_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "markdown"]), 1)
            markdown = output.getvalue()
            self.assertIn("# E-invoice preflight", markdown)
            self.assertIn("Overall: **FAIL**", markdown)
            self.assertIn("Failed: 1", markdown)
            self.assertIn("## `invoice.json`", markdown)
            self.assertIn("Status: **FAIL**", markdown)
            self.assertIn("**INV-017**", markdown)
            self.assertIn("`/totals/gross`", markdown)
            self.assertIn("Fix:", markdown)
            self.assertNotIn("INV-1", markdown)

    def test_cli_emits_markdown_for_batch_with_read_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pass.json").write_text(json.dumps(VALID))
            (root / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "markdown"]), 2)
            markdown = output.getvalue()
            self.assertIn("Overall: **FAIL**", markdown)
            self.assertIn("Checked: 1 invoice(s)", markdown)
            self.assertIn("Passed: 1", markdown)
            self.assertIn("Read errors: 1", markdown)
            self.assertIn("## `pass.json`", markdown)
            self.assertIn("Status: **PASS**", markdown)
            self.assertIn("## Read errors", markdown)
            self.assertIn("`broken.json`", markdown)

    def test_cli_emits_csv_triage_rows_without_invoice_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failed = json.loads(json.dumps(VALID))
            failed["totals"]["gross"] = 200
            (root / "fail.json").write_text(json.dumps(failed))
            passed = json.loads(json.dumps(VALID))
            passed["invoice_number"] = "INV-1002"
            (root / "pass.json").write_text(json.dumps(passed))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "csv"]), 1)
            self.assertIn("file,status,rule,path,message,fix,error\n", output.getvalue())
            self.assertIn("fail.json,fail,INV-017,/totals/gross", output.getvalue())
            self.assertIn("pass.json,pass,,,,,", output.getvalue())
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_csv_preserves_read_errors_for_batch_triage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "csv"]), 2)
            self.assertIn("broken.json,read_error", output.getvalue())

    def test_cli_emits_junit_for_findings_without_invoice_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice&review.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "junit"]), 1)
            junit = output.getvalue()
            self.assertIn('tests="1" failures="1" errors="0"', junit)
            self.assertIn('name="invoice&amp;review.json"', junit)
            self.assertIn("[INV-017] /totals/gross", junit)
            self.assertNotIn("INV-1", junit)

    def test_cli_junit_marks_read_errors_as_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            invoice_path.write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "junit"]), 2)
            junit = output.getvalue()
            self.assertIn('tests="1" failures="0" errors="1"', junit)
            self.assertIn("<error message=\"Invoice could not be read\">", junit)

    def test_cli_emits_pass_summary_for_valid_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pass.json").write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "markdown"]), 0)
            markdown = output.getvalue()
            self.assertIn("Overall: **PASS**", markdown)
            self.assertIn("Passed: 1", markdown)
            self.assertIn("Failed: 0", markdown)
            self.assertIn("Status: **PASS**", markdown)

    def test_cli_emits_markdown_finding_summary_for_repeated_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failed = json.loads(json.dumps(VALID))
            failed["totals"]["gross"] = 200
            (root / "first.json").write_text(json.dumps(failed))
            (root / "second|review.json").write_text(json.dumps(failed))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "markdown"]), 1)
            markdown = output.getvalue()
            self.assertIn("## Finding summary", markdown)
            self.assertIn("| `INV-017` | 2 | Gross total does not equal net plus tax. |", markdown)
            self.assertIn("## `second\\|review.json`", markdown)

    def test_cli_emits_standalone_html_report_without_invoice_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice<review>.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["invoice_number"] = "PRIVATE-123"
            invoice["totals"]["gross"] = 200
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "html"]), 1)
            report = output.getvalue()
            self.assertIn("<!doctype html>", report)
            self.assertIn("Overall: FAIL", report)
            self.assertIn("INV-017", report)
            self.assertIn("invoice&lt;review&gt;.json", report)
            self.assertNotIn("PRIVATE-123", report)
            self.assertNotIn("<script", report.lower())

    def test_cli_html_batch_includes_pass_and_read_error_sections(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pass.json").write_text(json.dumps(VALID))
            (root / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "html"]), 2)
            report = output.getvalue()
            self.assertIn("pass.json", report)
            self.assertIn("PASS", report)
            self.assertIn("Read errors", report)
            self.assertIn("broken.json", report)


if __name__ == "__main__":
    unittest.main()
