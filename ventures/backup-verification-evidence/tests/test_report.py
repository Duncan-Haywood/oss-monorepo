import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

import unittest

from backup_evidence.report import build_history_report, classify_run, markdown_report


def run(exit_code=0, finished_at="2026-08-24T03:00:00Z", artifact=None, expected=None, tool="restic"):
    record = {"tool": tool, "exit_code": exit_code, "finished_at": finished_at}
    if artifact is not None:
        record["artifact"] = artifact
    if expected is not None:
        record["expected"] = expected
    return record


class ClassifyRunTests(unittest.TestCase):
    def test_clean_exit_with_healthy_artifact_is_verified(self):
        record = run(
            artifact={"exists": True, "size_bytes": 5_000_000, "modified_at": "2026-08-24T02:58:00Z"},
            expected={"max_age_hours": 26, "min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "verified")

    def test_nonzero_exit_is_failed_even_with_a_fine_looking_artifact(self):
        record = run(
            exit_code=1,
            artifact={"exists": True, "size_bytes": 5_000_000, "modified_at": "2026-08-24T02:58:00Z"},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "failed")
        self.assertIn("exited 1", result["reasons"][0])

    def test_zero_exit_with_missing_artifact_is_suspicious_not_verified(self):
        record = run(artifact={"exists": False})
        result = classify_run(record)
        self.assertEqual(result["status"], "suspicious")
        self.assertIn("does not exist", result["reasons"][0])

    def test_zero_exit_with_undersized_artifact_is_suspicious(self):
        record = run(
            artifact={"exists": True, "size_bytes": 40, "modified_at": "2026-08-24T02:58:00Z"},
            expected={"min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "suspicious")
        self.assertIn("below the expected minimum", result["reasons"][0])

    def test_stale_artifact_reused_from_a_prior_run_is_suspicious(self):
        record = run(
            finished_at="2026-08-24T03:00:00Z",
            artifact={"exists": True, "size_bytes": 5_000_000, "modified_at": "2026-08-20T03:00:00Z"},
            expected={"max_age_hours": 26},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "suspicious")
        self.assertIn("stale file", result["reasons"][0])

    def test_missing_required_field_is_inconclusive_not_failed(self):
        result = classify_run({"tool": "restic", "exit_code": 0})
        self.assertEqual(result["status"], "inconclusive")

    def test_zero_exit_with_no_artifact_reported_is_inconclusive(self):
        result = classify_run(run(artifact=None))
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("no artifact was reported", result["reasons"][0])

    def test_unparseable_timestamp_is_inconclusive(self):
        result = classify_run(run(finished_at="not-a-date"))
        self.assertEqual(result["status"], "inconclusive")

    def test_non_integer_exit_code_is_inconclusive(self):
        result = classify_run(run(exit_code="0"))
        self.assertEqual(result["status"], "inconclusive")


class HistoryReportTests(unittest.TestCase):
    def test_counts_and_latest_are_reported(self):
        records = [
            run(finished_at="2026-08-22T03:00:00Z", artifact={"exists": True, "size_bytes": 100}),
            run(exit_code=1, finished_at="2026-08-23T03:00:00Z"),
            run(finished_at="2026-08-24T03:00:00Z", artifact={"exists": True, "size_bytes": 100}),
        ]
        report = build_history_report(records)
        self.assertEqual(report["run_count"], 3)
        self.assertEqual(report["status_counts"], {"verified": 2, "failed": 1})
        self.assertEqual(report["latest"]["finished_at"], "2026-08-24T03:00:00Z")
        self.assertEqual(report["latest"]["status"], "verified")

    def test_records_out_of_order_are_sorted_before_classifying_latest(self):
        records = [
            run(finished_at="2026-08-24T03:00:00Z", exit_code=1),
            run(finished_at="2026-08-22T03:00:00Z", artifact={"exists": True, "size_bytes": 100}),
        ]
        report = build_history_report(records)
        self.assertEqual(report["latest"]["status"], "failed")

    def test_empty_history_has_no_latest(self):
        report = build_history_report([])
        self.assertIsNone(report["latest"])
        self.assertEqual(report["run_count"], 0)

    def test_markdown_discloses_limits_and_is_not_a_warranty(self):
        report = build_history_report([run(artifact={"exists": True, "size_bytes": 100})])
        output = markdown_report(report)
        self.assertIn("not a guarantee that your data is safe", output)
        self.assertIn("## Limits", output)


if __name__ == "__main__":
    unittest.main()
