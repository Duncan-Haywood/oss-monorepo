import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from permission_drift import compare, load_inventory, usage_event, write_report


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
            path = Path(directory) / "report.json"
            report = compare(self.before, self.after)
            write_report(path, report)
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved, report)
            self.assertNotIn("scopes", saved["metadata"])

    def test_rejects_invalid_capture_time_and_duplicate_scopes(self):
        invalid_time = dict(self.before, captured_at="not-a-timestamp")
        with self.assertRaisesRegex(ValueError, "ISO 8601"):
            load_inventory_from_data(invalid_time)

        duplicate_scopes = dict(self.before, apps=[dict(self.before["apps"][0], scopes=["read_analytics", "read_analytics"])])
        with self.assertRaisesRegex(ValueError, "duplicate scopes"):
            compare(duplicate_scopes, self.after)


def load_inventory_from_data(data):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as handle:
        json.dump(data, handle)
        handle.flush()
        return load_inventory(Path(handle.name))


if __name__ == "__main__":
    unittest.main()
