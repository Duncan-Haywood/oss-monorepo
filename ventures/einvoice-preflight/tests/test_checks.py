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
    def test_cli_reports_version(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as raised:
            main(["--version"])
        self.assertEqual(raised.exception.code, 0)
        self.assertEqual(output.getvalue(), "einvoice-preflight 0.1.0\n")

    def test_cli_checklist_groups_findings_without_invoice_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(path), "--format", "checklist"]), 1)
            checklist = output.getvalue()
            self.assertIn("Status: FAIL", checklist)
            self.assertIn("Checked: 1 invoice(s)", checklist)
            self.assertIn("Observations: 1", checklist)
            self.assertIn("[ ] Review invoice.json", checklist)
            self.assertIn("INV-017", checklist)
            self.assertIn("/totals/gross", checklist)
            self.assertIn("Fix:", checklist)
            self.assertNotIn("INV-1", checklist)
            self.assertNotIn("200", checklist)
            self.assertNotIn("238", checklist)

    def test_ubl_invoice_maps_to_supported_shape(self):
        self.assertEqual(check_invoice(parse_ubl_invoice(UBL_VALID)), [])

    def test_ubl_multiple_tax_totals_are_added(self):
        source = UBL_VALID.replace(
            b'<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>',
            b'<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19</cbc:TaxAmount></cac:TaxTotal>'
            b'<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">19</cbc:TaxAmount></cac:TaxTotal>',
        )
        invoice = parse_ubl_invoice(source)
        self.assertEqual(invoice["totals"]["tax"], 38)
        self.assertEqual(check_invoice(invoice), [])

    def test_ubl_due_date_is_preserved_for_date_checks(self):
        invoice = parse_ubl_invoice(UBL_VALID.replace(
            b"<cbc:ID>INV-XML-1</cbc:ID>",
            b"<cbc:ID>INV-XML-1</cbc:ID><cbc:DueDate>2026-08-23</cbc:DueDate>",
        ))
        self.assertEqual(invoice["due_date"], "2026-08-23")
        self.assertIn("INV-021", {error["rule"] for error in check_invoice(invoice)})

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

    def test_prepaid_and_due_are_optional_and_must_balance(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["prepaid"] = 38
        invoice["totals"]["due"] = 200
        self.assertEqual(check_invoice(invoice), [])

        invoice["totals"]["due"] = 238
        errors = check_invoice(invoice)
        self.assertIn("INV-029", {error["rule"] for error in errors})
        self.assertEqual(next(error for error in errors if error["rule"] == "INV-029")["path"], "/totals/due")

        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["prepaid"] = 300
        errors = check_invoice(invoice)
        self.assertIn("INV-028", {error["rule"] for error in errors})
        self.assertEqual(next(error for error in errors if error["rule"] == "INV-028")["path"], "/totals/prepaid")

        invoice = json.loads(json.dumps(VALID))
        invoice["totals"]["due"] = 0
        errors = check_invoice(invoice)
        self.assertIn("INV-029", {error["rule"] for error in errors})
        self.assertTrue(any("gross minus prepaid" in error["message"] for error in errors))

    def test_ubl_prepaid_and_payable_map_into_remaining_balance(self):
        matching = UBL_VALID.replace(
            b"<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>",
            b"<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>"
            b"<cbc:PrepaidAmount>38</cbc:PrepaidAmount>"
            b"<cbc:PayableAmount>200</cbc:PayableAmount>",
        )
        invoice = parse_ubl_invoice(matching)
        self.assertEqual(invoice["totals"]["prepaid"], 38)
        self.assertEqual(invoice["totals"]["due"], 200)
        self.assertEqual(check_invoice(invoice), [])

        mismatched = UBL_VALID.replace(
            b"<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>",
            b"<cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount>"
            b"<cbc:PayableAmount>200</cbc:PayableAmount>",
        )
        errors = check_invoice(parse_ubl_invoice(mismatched))
        self.assertIn("INV-029", {error["rule"] for error in errors})

    def test_tax_total_rounds_each_line_to_cents(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["lines"] = [
            {"description": "A", "quantity": 1, "unit_price": 0.03, "tax_percent": 19, "net": 0.03},
            {"description": "B", "quantity": 1, "unit_price": 0.03, "tax_percent": 19, "net": 0.03},
        ]
        invoice["totals"] = {"net": 0.06, "tax": 0.02, "gross": 0.08}
        self.assertEqual(check_invoice(invoice), [])

    def test_fractional_quantity_is_not_rounded_before_line_calculation(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["lines"] = [{
            "description": "Fabric",
            "quantity": 1.25,
            "unit_price": 10,
            "tax_percent": 19,
            "net": 12.50,
        }]
        invoice["totals"] = {"net": 12.50, "tax": 2.38, "gross": 14.88}
        self.assertEqual(check_invoice(invoice), [])

    def test_fractional_tax_percentage_is_not_rounded_before_tax_calculation(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["lines"][0]["tax_percent"] = 19.5
        invoice["totals"] = {"net": 200, "tax": 39, "gross": 239}
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

    def test_due_date_is_optional_but_must_be_iso_and_not_before_issue_date(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["due_date"] = "2026-08-23"
        errors = check_invoice(invoice)
        self.assertIn("INV-021", {error["rule"] for error in errors})
        self.assertEqual(next(error for error in errors if error["rule"] == "INV-021")["path"], "/due_date")

        invoice["due_date"] = "23/09/2026"
        errors = check_invoice(invoice)
        self.assertIn("INV-020", {error["rule"] for error in errors})

    def test_due_date_is_accepted_when_on_or_after_issue_date(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["due_date"] = "2026-08-24"
        self.assertEqual(check_invoice(invoice), [])

    def test_dates_require_extended_iso_yyyy_mm_dd_form(self):
        invoice = json.loads(json.dumps(VALID))
        invoice["issue_date"] = "20260824"
        invoice["due_date"] = "2026-W35-1"
        rules = {error["rule"] for error in check_invoice(invoice)}
        self.assertIn("INV-003", rules)
        self.assertIn("INV-020", rules)

    def test_cli_writes_only_aggregate_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]), 0)
            self.assertEqual(
                json.loads(usage_path.read_text()),
                {"events": {"invoice_preflight_attempted": 1, "invoice_preflight_checked": 1}},
            )

    def test_cli_counts_attempted_use_when_input_cannot_be_parsed(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text("{not-json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(
                    main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]),
                    2,
                )
            self.assertEqual(
                json.loads(usage_path.read_text()),
                {"events": {"invoice_preflight_attempted": 1}},
            )

    def test_cli_counts_attempt_once_and_checked_per_valid_invoice_in_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            invoices = root / "invoices"
            invoices.mkdir()
            (invoices / "valid.json").write_text(json.dumps(VALID))
            (invoices / "broken.json").write_text("{not-json")
            usage_path = root / "usage.json"
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(
                    main([str(invoices), "--format", "json", "--usage-file", str(usage_path)]),
                    2,
                )
            self.assertEqual(
                json.loads(usage_path.read_text()),
                {"events": {"invoice_preflight_attempted": 1, "invoice_preflight_checked": 1}},
            )

    def test_cli_writes_report_to_output_file(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            report_path = Path(directory) / "reports" / "preflight.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--output", str(report_path)]), 0)
            self.assertEqual(output.getvalue(), "")
            report = json.loads(report_path.read_text())
            self.assertEqual(report["status"], "pass")
            self.assertFalse(list(report_path.parent.glob(".preflight.json.*")))

    def test_cli_remediation_csv_groups_findings_without_invoice_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = json.loads(json.dumps(VALID))
            first["totals"]["gross"] = 200
            second = json.loads(json.dumps(VALID))
            second["invoice_number"] = "INV-2"
            second["totals"]["gross"] = 201
            (root / "first.json").write_text(json.dumps(first))
            (root / "second.json").write_text(json.dumps(second))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "remediation-csv"]), 1)
            lines = output.getvalue().splitlines()
            self.assertEqual(lines[0], "rule,occurrences,message,fix")
            self.assertIn("INV-017,2,Gross total does not equal net plus tax.", lines[1])
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_remediation_csv_surfaces_read_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "remediation-csv"]), 2)
            self.assertIn("INV-READ,1,Invoice could not be read.", output.getvalue())

    def test_cli_reports_output_write_failure_without_partial_file(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stderr(output), patch("einvoice_preflight.cli._write_output", side_effect=OSError("read-only")):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--output", str(Path(directory) / "report.json")]), 2)
            self.assertIn("Could not write report", output.getvalue())

    def test_cli_ignores_invalid_usage_counter(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            usage_path.write_text(json.dumps({"events": {"invoice_preflight_checked": "unknown"}}))
            self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]), 0)
            self.assertEqual(
                json.loads(usage_path.read_text()),
                {"events": {"invoice_preflight_attempted": 1, "invoice_preflight_checked": 1}},
            )

    def test_usage_write_failure_does_not_fail_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            with patch("einvoice_preflight.cli.Path.write_text", side_effect=OSError("read-only")):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(Path(directory) / "usage.json")]), 0)

    def test_usage_replace_failure_preserves_existing_state(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            usage_path.write_text(json.dumps({"events": {"invoice_preflight_checked": 7}}))
            with patch("einvoice_preflight.cli.os.replace", side_effect=OSError("interrupted")):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--usage-file", str(usage_path)]), 0)
            self.assertEqual(json.loads(usage_path.read_text()), {"events": {"invoice_preflight_checked": 7}})
            self.assertEqual(
                {path.name for path in Path(directory).iterdir()},
                {"invoice.json", "usage.json", ".usage.json.lock"},
            )

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
            self.assertEqual(report["errors"][0]["file"], "invoice.json")

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
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["exit_code"], 1)
            self.assertEqual(report["file"], "invoice.json")
            self.assertEqual(report["files_checked"], 1)
            self.assertEqual(report["files_failed"], 1)
            self.assertEqual(report["observations"], 1)
            self.assertEqual(report["rules"], {"INV-017": 1})
            self.assertEqual(report["fixes"], [{
                "rule": "INV-017",
                "occurrences": 1,
                "message": "Gross total does not equal net plus tax.",
                "fix": "Set gross total to 238.00 or correct the totals.",
            }])
            self.assertEqual(report["errors"][0]["rule"], "INV-017")
            self.assertEqual(report["errors"][0]["file"], "invoice.json")

    def test_cli_json_groups_repeated_fixes_without_invoice_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = json.loads(json.dumps(VALID))
            first["totals"]["gross"] = 200
            second = json.loads(json.dumps(VALID))
            second["invoice_number"] = "INV-2"
            second["totals"]["gross"] = 201
            (root / "first.json").write_text(json.dumps(first))
            (root / "second.json").write_text(json.dumps(second))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["fixes"][0]["rule"], "INV-017")
            self.assertEqual(report["fixes"][0]["occurrences"], 2)
            self.assertEqual(
                {(error["file"], error["rule"]) for error in report["errors"]},
                {("first.json", "INV-017"), ("second.json", "INV-017")},
            )
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_remediation_groups_findings_by_file_and_rule(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice = json.loads(json.dumps(VALID))
            invoice["totals"]["gross"] = 200
            invoice["lines"][0]["net"] = 201
            invoice_path.write_text(json.dumps(invoice))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "remediation"]), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["status"], "fail")
            self.assertEqual(report["files_checked"], 1)
            self.assertEqual({item["rule"] for item in report["items"]}, {"INV-012", "INV-017"})
            gross = next(item for item in report["items"] if item["rule"] == "INV-017")
            self.assertEqual(gross["occurrences"], 1)
            self.assertEqual(gross["paths"], ["/totals/gross"])
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_remediation_reports_read_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(Path(directory)), "--format", "remediation"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["status"], "fail")
            self.assertEqual(report["exit_code"], 2)
            self.assertEqual(report["items"], [])
            self.assertEqual(len(report["read_errors"]), 1)

    def test_cli_json_success_reports_machine_result_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["status"], "pass")
            self.assertEqual(report["exit_code"], 0)

    def test_cli_json_read_error_reports_machine_result_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "broken.json"
            invoice_path.write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["status"], "fail")
            self.assertEqual(report["exit_code"], 2)

    def test_cli_emits_jsonl_one_record_per_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failed = json.loads(json.dumps(VALID))
            failed["totals"]["gross"] = 200
            (root / "fail.json").write_text(json.dumps(failed))
            passed = json.loads(json.dumps(VALID))
            passed["invoice_number"] = "INV-2"
            (root / "pass.json").write_text(json.dumps(passed))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "jsonl"]), 1)
            records = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual([record["file"] for record in records], ["fail.json", "pass.json"])
            self.assertEqual(records[0]["status"], "fail")
            self.assertEqual(records[0]["schema_version"], 1)
            self.assertEqual(records[0]["observations"], 1)
            self.assertEqual(records[0]["fixes"], [{
                "rule": "INV-017",
                "occurrences": 1,
                "message": "Gross total does not equal net plus tax.",
                "fix": "Set gross total to 238.00 or correct the totals.",
            }])
            self.assertEqual(records[0]["errors"][0]["rule"], "INV-017")
            self.assertEqual(records[1], {
                "schema_version": 1,
                "status": "pass",
                "file": "pass.json",
                "observations": 0,
                "fixes": [],
                "errors": [],
            })
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_emits_privacy_safe_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failed = json.loads(json.dumps(VALID))
            failed["totals"]["gross"] = 200
            (root / "fail.json").write_text(json.dumps(failed))
            (root / "pass.json").write_text(json.dumps({**VALID, "invoice_number": "INV-2"}))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "summary"]), 1)
            self.assertEqual(output.getvalue().splitlines(), [
                "E-invoice preflight summary", "Overall: FAIL", "Checked: 2",
                "Passed: 1", "Failed: 1", "Observations: 1", "Read errors: 0",
                "Rules: INV-017=1",
            ])
            self.assertNotIn("INV-1", output.getvalue())

    def test_cli_jsonl_keeps_read_errors_as_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "broken.json").write_text("not json")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "jsonl"]), 2)
            record = json.loads(output.getvalue())
            self.assertEqual(record["schema_version"], 1)
            self.assertEqual(record["status"], "read_error")
            self.assertEqual(record["file"], "broken.json")
            self.assertEqual(record["observations"], 0)
            self.assertEqual(record["fixes"], [])
            self.assertEqual(record["errors"], [])
            self.assertIn("Expecting value", record["error"])

    def test_cli_max_files_bounds_directory_scan_before_reading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "one.json").write_text(json.dumps(VALID))
            (root / "two.xml").write_bytes(UBL_VALID)
            output = io.StringIO()
            errors = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(main([directory, "--max-files", "1", "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["exit_code"], 2)
            self.assertIn("exceeding --max-files 1", report["read_errors"][0]["error"])
            self.assertEqual(errors.getvalue(), "")

    def test_cli_rejects_non_positive_max_files(self):
        with self.assertRaises(SystemExit) as result:
            main([".", "--max-files", "0"])
        self.assertEqual(result.exception.code, 2)

    def test_cli_max_depth_skips_nested_invoices_without_reading_them(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nested = root / "archive" / "2024"
            nested.mkdir(parents=True)
            (root / "invoice.json").write_text(json.dumps(VALID))
            buried = json.loads(json.dumps(VALID))
            buried["invoice_number"] = "INV-BURIED"
            buried["totals"]["gross"] = 200
            (nested / "buried.json").write_text(json.dumps(buried))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--max-depth", "1", "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 1)
            self.assertEqual(report["status"], "pass")
            self.assertEqual(report["read_errors"], [])

    def test_cli_max_depth_two_includes_one_subdirectory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = root / "batch"
            deeper = child / "archive"
            deeper.mkdir(parents=True)
            (root / "invoice.json").write_text(json.dumps(VALID))
            child_invoice = json.loads(json.dumps(VALID))
            child_invoice["invoice_number"] = "INV-CHILD"
            (child / "child.json").write_text(json.dumps(child_invoice))
            buried = json.loads(json.dumps(VALID))
            buried["invoice_number"] = "INV-BURIED"
            buried["totals"]["gross"] = 200
            (deeper / "buried.json").write_text(json.dumps(buried))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--max-depth", "2", "--format", "json"]), 0)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 2)
            self.assertEqual(report["status"], "pass")

    def test_cli_rejects_non_positive_max_depth(self):
        with self.assertRaises(SystemExit) as result:
            main([".", "--max-depth", "0"])
        self.assertEqual(result.exception.code, 2)

    def test_cli_max_bytes_rejects_oversized_file_before_parsing(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "large.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--max-bytes", "10", "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 0)
            self.assertIn("exceeds --max-bytes 10", report["read_errors"][0]["error"])

    def test_cli_max_bytes_limits_stdin_without_parsing(self):
        output = io.StringIO()
        with patch("einvoice_preflight.cli.sys.stdin", io.StringIO(json.dumps(VALID))), contextlib.redirect_stdout(output):
            self.assertEqual(main(["-", "--max-bytes", "10", "--format", "json"]), 2)
        report = json.loads(output.getvalue())
        self.assertEqual(report["read_errors"][0]["file"], "stdin.json")
        self.assertIn("exceeds --max-bytes 10", report["read_errors"][0]["error"])

    def test_cli_rejects_non_positive_max_bytes(self):
        with self.assertRaises(SystemExit) as result:
            main([".", "--max-bytes", "0"])
        self.assertEqual(result.exception.code, 2)

    def test_cli_accepts_positive_max_files_with_cli_integer_syntax(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "invoice.json").write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--max-files", "+1", "--format", "json"]), 0)
            self.assertEqual(json.loads(output.getvalue())["files_checked"], 1)

    def test_cli_rejects_non_integer_max_files_with_actionable_error(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output), self.assertRaises(SystemExit) as result:
            main([".", "--max-files", "many"])
        self.assertEqual(result.exception.code, 2)
        self.assertIn("--max-files: must be a positive integer", output.getvalue())

    def test_cli_max_bytes_rejects_oversized_file_before_reading(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--max-bytes", "10", "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["files_checked"], 0)
            self.assertIn("exceeds --max-bytes 10", report["read_errors"][0]["error"])

    def test_cli_max_bytes_rejects_oversized_stdin(self):
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO(json.dumps(VALID))), contextlib.redirect_stdout(output):
            self.assertEqual(main(["-", "--max-bytes", "10", "--format", "json"]), 2)
        report = json.loads(output.getvalue())
        self.assertIn("exceeds --max-bytes 10", report["read_errors"][0]["error"])

    def test_cli_rejects_non_integer_max_bytes_with_actionable_error(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output), self.assertRaises(SystemExit) as result:
            main([".", "--max-bytes", "many"])
        self.assertEqual(result.exception.code, 2)
        self.assertIn("--max-bytes: must be a positive integer", output.getvalue())

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

    def test_cli_json_empty_directory_keeps_machine_readable_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["exit_code"], 2)
            self.assertEqual(report["files_checked"], 0)
            self.assertEqual(report["read_errors"][0]["error"], "No JSON, XML, or PDF invoices found.")

    def test_cli_json_max_files_refusal_keeps_machine_readable_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "one.json").write_text(json.dumps(VALID))
            (root / "two.json").write_text(json.dumps({**VALID, "invoice_number": "INV-2"}))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([directory, "--format", "json", "--max-files", "1"]), 2)
            report = json.loads(output.getvalue())
            self.assertEqual(report["schema_version"], 1)
            self.assertEqual(report["exit_code"], 2)
            self.assertEqual(report["files_checked"], 0)
            self.assertIn("exceeding --max-files 1", report["read_errors"][0]["error"])

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

    def test_cli_emits_github_notice_for_valid_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "github"]), 0)
            report = output.getvalue()
            self.assertIn("::notice title=E-invoice preflight::Passed: 1 invoice(s)", report)
            self.assertNotIn("INV-1", report)
            self.assertNotIn("::error", report)

    def test_cli_records_github_report_usage_separately(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            usage_path = Path(directory) / "usage.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([
                    str(invoice_path), "--format", "github", "--usage-file", str(usage_path)
                ]), 0)
            self.assertEqual(json.loads(usage_path.read_text()), {"events": {
                "invoice_preflight_attempted": 1,
                "invoice_preflight_checked": 1,
                "invoice_preflight_github_report": 1,
            }})

    # The failing-JUnit case lives further down as
    # test_cli_emits_junit_for_findings_without_invoice_contents, which also
    # covers XML-escaping the filename. A second copy here would silently
    # shadow it rather than add coverage, so only the clean case is new.
    def test_cli_emits_passing_junit_for_clean_invoice(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "junit"]), 0)
            self.assertIn('tests="1" failures="0"', output.getvalue())
            self.assertNotIn("<failure", output.getvalue())

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
            self.assertIn('href="#invoice-0"', report)
            self.assertIn('id="invoice-0"', report)
            self.assertIn('caption>Findings grouped by validation rule', report)
            self.assertIn('scope="col"', report)
            self.assertIn('href="#report-content">Skip to report content', report)
            self.assertIn('<main id="report-content" aria-label="Preflight report">', report)
            self.assertIn('role="status">Overall: FAIL', report)
            self.assertIn('aria-labelledby="finding-summary-heading"', report)
            self.assertIn('aria-label="Report metrics"', report)
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

    def test_cli_writes_report_artifact_without_stdout(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            output_path = Path(directory) / "reports" / "review.json"
            invoice_path.write_text(json.dumps(VALID))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main([str(invoice_path), "--format", "json", "--output", str(output_path)]), 0)
            self.assertEqual(output.getvalue(), "")
            report = json.loads(output_path.read_text())
            self.assertEqual(report["status"], "pass")

    def test_cli_output_write_failure_is_an_input_error(self):
        with tempfile.TemporaryDirectory() as directory:
            invoice_path = Path(directory) / "invoice.json"
            invoice_path.write_text(json.dumps(VALID))
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([str(invoice_path), "--format", "html", "--output", directory]), 2)


if __name__ == "__main__":
    unittest.main()
