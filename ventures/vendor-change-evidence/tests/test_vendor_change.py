import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from vendor_change import compare, load_snapshot


class VendorChangeTests(unittest.TestCase):
    def test_content_change_requires_review(self):
        before = {"url": "https://x/p", "captured_at": "2026-08-23T00:00:00Z", "fetch_status": "ok", "text": "old"}
        after = {**before, "captured_at": "2026-08-24T00:00:00Z", "text": "new"}
        report = compare(before, after)
        self.assertEqual(report["status"], "changed")
        self.assertEqual(report["changes"][0]["kind"], "content_changed")

    def test_failed_fetch_is_inconclusive(self):
        before = {"url": "https://x/p", "captured_at": "2026-08-23T00:00:00Z", "fetch_status": "timeout", "text": "old"}
        after = {**before, "captured_at": "2026-08-24T00:00:00Z", "fetch_status": "ok"}
        self.assertEqual(compare(before, after)["status"], "inconclusive")

    def test_missing_field_is_rejected(self):
        with self.assertRaises(ValueError):
            load_snapshot(Path("/does/not/exist"))

    def test_example_snapshots_are_changed(self):
        root = Path(__file__).parents[1]
        report = compare(
            load_snapshot(root / "examples/before.json"),
            load_snapshot(root / "examples/after.json"),
        )
        self.assertEqual(report["status"], "changed")
        self.assertEqual(report["changes"][0]["kind"], "content_changed")


if __name__ == "__main__":
    unittest.main()
