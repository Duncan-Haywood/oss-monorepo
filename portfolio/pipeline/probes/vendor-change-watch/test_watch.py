import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from watch import compare, load  # noqa: E402


FIXTURES = Path(__file__).parent / "fixtures"


class VendorChangeWatchTests(unittest.TestCase):
    def test_changed_record_keeps_provenance_and_raw_evidence(self):
        report = compare(load(FIXTURES / "before.json"), load(FIXTURES / "after.json"))
        self.assertEqual(report["status"], "changed")
        self.assertEqual(report["url"], "https://vendor.example/legal/subprocessors")
        self.assertEqual(report["section"], "Subprocessors")
        self.assertEqual(report["before"]["http_status"], 200)
        self.assertIn("Payments: New Payments Ltd", report["after"]["text"])
        self.assertIn("+Payments: New Payments Ltd", report["diff"])
        self.assertIn("not legal advice", report["boundary"])

    def test_failed_fetch_is_inconclusive_not_unchanged(self):
        report = compare(load(FIXTURES / "before.json"), load(FIXTURES / "fetch-failed.json"))
        self.assertEqual(report["status"], "inconclusive")
        self.assertIn("not evidence of stability", report["reason"])

    def test_different_urls_are_inconclusive(self):
        before = load(FIXTURES / "before.json")
        after = load(FIXTURES / "after.json")
        after["url"] = "https://other.example/privacy"
        self.assertEqual(compare(before, after), {"status": "inconclusive", "reason": "source URL changed"})

    def test_cli_report_is_json_serializable(self):
        report = compare(load(FIXTURES / "before.json"), load(FIXTURES / "after.json"))
        json.dumps(report)


if __name__ == "__main__":
    unittest.main()
