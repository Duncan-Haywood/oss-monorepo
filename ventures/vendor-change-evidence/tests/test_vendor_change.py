import unittest
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
            load_snapshot(__import__("pathlib").Path("/does/not/exist"))


if __name__ == "__main__":
    unittest.main()
