import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from permission_drift import compare, load_inventory, usage_event


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


if __name__ == "__main__":
    unittest.main()
