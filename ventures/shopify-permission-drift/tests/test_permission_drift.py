import json
import subprocess
import tempfile
import unittest
from unittest import mock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from permission_drift import compare, load_inventory, render_markdown, usage_event, write_report


class PermissionDriftTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).parents[1]
        self.before = load_inventory(root / "examples/before.json")
        self.after = load_inventory(root / "examples/after.json")

    def test_detects_scope_and_webhook_changes(self):
        report = compare(self.before, self.after)
        self.assertEqual(report["status"], "changed")
        self.assertEqual([change["kind"] for change in report["changes"]], ["scopes_changed", "webhooks_changed"])
        self.assertTrue(report["review_required"])

    def test_identical_inventory_is_unchanged(self):
        report = compare(self.before, self.before)
        self.assertEqual(report["status"], "unchanged")
        self.assertFalse(report["review_required"])

    def test_usage_log_contains_only_aggregate_event(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "usage.jsonl"
            usage_event(path, 2)
            event = json.loads(path.read_text().strip())
            self.assertEqual(event["event"], "inventory_compared")
            self.assertEqual(event["finding_count"], 2)
            self.assertEqual(set(event), {"event", "day", "finding_count"})

    def test_report_can_be_saved_as_portable_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "queue" / "report.json"
            report = compare(self.before, self.after)
            write_report(path, report)
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved, report)
            self.assertNotIn("scopes", saved["metadata"])
            self.assertFalse(list(path.parent.glob(".report.json.*")))

    def test_report_write_failure_leaves_the_previous_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text('{"kept": true}\n', encoding="utf-8")
            report = compare(self.before, self.after)
            with mock.patch("permission_drift.os.replace", side_effect=OSError("read-only")):
                with self.assertRaises(ValueError):
                    write_report(path, report)
            self.assertEqual(path.read_text(encoding="utf-8"), '{"kept": true}\n')
            self.assertFalse(list(path.parent.glob(".report.json.*")))

    def test_cli_output_remains_json_when_display_format_is_markdown(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).parents[1] / "src/permission_drift.py"),
                    str(Path(__file__).parents[1] / "examples/before.json"),
                    str(Path(__file__).parents[1] / "examples/after.json"),
                    "--format", "markdown",
                    "--output", str(path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn("Shopify permission drift", result.stdout)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), compare(self.before, self.after))

    def test_github_format_emits_one_warning_per_change(self):
        root = Path(__file__).parents[1]
        result = subprocess.run(
            [sys.executable, str(root / "src/permission_drift.py"), str(root / "examples/before.json"), str(root / "examples/after.json"), "--format", "github"],
            check=True,
            capture_output=True,
            text=True,
        )
        warnings = [line for line in result.stdout.splitlines() if line.startswith("::warning")]
        self.assertEqual(len(warnings), 2)
        self.assertTrue(all('title=Shopify permission drift::' in line for line in warnings))
    def test_markdown_report_is_approval_ready_and_discloses_limits(self):
        report = compare(self.before, self.after)
        rendered = render_markdown(report)
        self.assertIn("# Shopify permission drift: changed", rendered)
        self.assertIn("**Scopes Changed**", rendered)
        self.assertIn("`read_reports`", rendered)
        self.assertIn("Evidence only", rendered)
        self.assertIn("No warranty", rendered)

    def test_markdown_unchanged_report_is_explicit(self):
        rendered = render_markdown(compare(self.before, self.before))
        self.assertIn("No app, scope, webhook", rendered)
        self.assertIn("Review required:** no", rendered)

    def test_rejects_invalid_capture_time_and_duplicate_scopes(self):
        invalid_time = dict(self.before, captured_at="not-a-timestamp")
        with self.assertRaisesRegex(ValueError, "ISO 8601"):
            load_inventory_from_data(invalid_time)

        duplicate_scopes = dict(self.before, apps=[dict(self.before["apps"][0], scopes=["read_analytics", "read_analytics"])])
        with self.assertRaisesRegex(ValueError, "duplicate scopes"):
            compare(duplicate_scopes, self.after)

    def test_marks_reversed_capture_order_inconclusive(self):
        report = compare(self.after, self.before)
        self.assertEqual(report["status"], "inconclusive")
        self.assertTrue(report["review_required"])
        self.assertEqual(report["changes"][-1]["kind"], "capture_order_invalid")


def load_inventory_from_data(data):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as handle:
        json.dump(data, handle)
        handle.flush()
        return load_inventory(Path(handle.name))


if __name__ == "__main__":
    unittest.main()
