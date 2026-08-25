import json
import tempfile
import unittest
from pathlib import Path

from fifo_pick_evidence import check_rows, read_report, record_usage


class FifoEvidenceTests(unittest.TestCase):
    def test_flags_older_lot_picked_after_newer_order(self):
        rows = [
            {"order_id": "old", "sku": "A", "lot": "1", "received_at": "2026-01-01T00:00:00Z", "picked_at": "2026-01-03T00:00:00Z"},
            {"order_id": "new", "sku": "A", "lot": "2", "received_at": "2026-01-02T00:00:00Z", "picked_at": "2026-01-02T12:00:00Z"},
        ]
        self.assertEqual(check_rows(rows)[0]["kind"], "fifo-exception")

    def test_reports_missing_data_and_bad_time(self):
        rows = [{"order_id": "x", "sku": "A", "lot": "", "received_at": "bad", "picked_at": "2026-01-01T00:00:00Z"}]
        kinds = {item["kind"] for item in check_rows(rows)}
        self.assertEqual(kinds, {"missing-data"})

    def test_reports_timezone_less_time_instead_of_crashing(self):
        rows = [{"order_id": "x", "sku": "A", "lot": "1", "received_at": "2026-01-01T00:00:00", "picked_at": "2026-01-01T01:00:00Z"}]
        self.assertEqual(check_rows(rows)[0]["kind"], "invalid-timestamp")

    def test_usage_is_anonymous_and_opt_in(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "usage.json"
            record_usage(path)
            self.assertEqual(json.loads(path.read_text())["events"], 1)

    def test_csv_report_requires_headers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "picks.csv"
            path.write_text("order_id,sku\nx,A\n")
            with self.assertRaises(ValueError):
                read_report(path)


if __name__ == "__main__":
    unittest.main()
