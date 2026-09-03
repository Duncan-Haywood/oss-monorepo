import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

import unittest

from backup_evidence.report import build_history_report, build_trend, classify_run, markdown_report


def run(exit_code=0, finished_at="2026-08-24T03:00:00Z", artifact=None, expected=None, tool="restic", started_at=None):
    record = {"tool": tool, "exit_code": exit_code, "finished_at": finished_at}
    if started_at is not None:
        record["started_at"] = started_at
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

    def test_artifact_reused_from_yesterday_is_suspicious_even_within_max_age_hours(self):
        # Regression: a nightly job's max_age_hours is set wide enough (26h)
        # to tolerate normal cadence jitter around a 24h schedule. That same
        # width used to let a run that silently reused yesterday's untouched
        # artifact (~24h old) read as `verified`, because 24h < 26h. Knowing
        # when *this* run started catches it regardless of that threshold.
        record = run(
            started_at="2026-08-24T03:00:00Z",
            finished_at="2026-08-24T03:00:05Z",
            artifact={"exists": True, "size_bytes": 5_000_000, "modified_at": "2026-08-23T03:00:05Z"},
            expected={"max_age_hours": 26, "min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "suspicious")
        self.assertIn("not written during this run", result["reasons"][0])

    def test_artifact_written_during_this_run_is_verified_even_if_run_started_earlier(self):
        record = run(
            started_at="2026-08-24T03:00:00Z",
            finished_at="2026-08-24T03:04:00Z",
            artifact={"exists": True, "size_bytes": 5_000_000, "modified_at": "2026-08-24T03:03:59Z"},
            expected={"max_age_hours": 26, "min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "verified")

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


class TrendTests(unittest.TestCase):
    def _night(self, day, size, exit_code=0):
        return run(
            exit_code=exit_code,
            started_at=f"2026-08-{day}T03:00:00Z",
            finished_at=f"2026-08-{day}T03:04:00Z",
            artifact={
                "exists": True,
                "size_bytes": size,
                "modified_at": f"2026-08-{day}T03:03:50Z",
            },
            expected={"min_size_bytes": 1_000_000, "max_age_hours": 26},
        )

    def test_verified_nights_still_flag_a_twenty_percent_shrink(self):
        trend = build_trend(
            [
                self._night("21", 50_000_000),
                self._night("22", 51_200_000),
                self._night("23", 50_400_000),
                self._night("24", 12_000_000),
            ]
        )
        latest = trend["latest"]
        self.assertEqual(latest["status"], "verified")
        self.assertTrue(latest["shrinking_vs_previous"])
        self.assertTrue(latest["shrinking_vs_median"])
        kinds = {alert["kind"] for alert in trend["alerts"]}
        self.assertIn("shrinking_vs_previous", kinds)
        self.assertIn("shrinking_vs_median", kinds)

    def test_a_small_wobble_is_not_an_alert(self):
        trend = build_trend(
            [
                self._night("21", 50_000_000),
                self._night("22", 48_000_000),
            ]
        )
        self.assertEqual(trend["alert_count"], 0)
        self.assertFalse(trend["latest"]["shrinking_vs_previous"])

    def test_status_regression_is_flagged_even_when_size_is_stable(self):
        trend = build_trend(
            [
                self._night("23", 50_000_000),
                self._night("24", 50_000_000, exit_code=1),
            ]
        )
        self.assertTrue(trend["latest"]["status_regression"])
        self.assertEqual(trend["alerts"][0]["kind"], "status_regression")

    def test_markdown_includes_trend_only_when_attached(self):
        records = [self._night("23", 50_000_000), self._night("24", 10_000_000)]
        plain = markdown_report(build_history_report(records))
        self.assertNotIn("Night-over-night trend", plain)
        with_trend = build_history_report(records)
        with_trend["trend"] = build_trend(records)
        output = markdown_report(with_trend)
        self.assertIn("Night-over-night trend", output)
        self.assertIn("smaller than previous", output)

    def test_invalid_shrink_ratio_falls_back_to_the_default(self):
        trend = build_trend([self._night("23", 50_000_000)], shrink_ratio=2)
        self.assertEqual(trend["shrink_ratio"], 0.2)

    def test_alert_details_and_the_markdown_table_are_human_readable_not_raw_bytes(self):
        records = [
            self._night("21", 50_000_000),
            self._night("22", 51_200_000),
            self._night("23", 50_400_000),
            self._night("24", 12_000_000),
        ]
        trend = build_trend(records)
        for alert in trend["alerts"]:
            if alert["kind"] == "status_regression":
                continue
            self.assertNotRegex(alert["detail"], r"\d+ bytes to \d+ bytes")
            self.assertRegex(alert["detail"], r"\d+(\.\d+)? (bytes|KB|MB|GB) to \d+(\.\d+)? (bytes|KB|MB|GB)")

        report = build_history_report(records)
        report["trend"] = trend
        output = markdown_report(report)
        for row in trend["rows"]:
            self.assertNotIn(f"{row['size_bytes']} bytes", output)
        self.assertIn("50.0 MB", output)
        self.assertIn("12.0 MB", output)


if __name__ == "__main__":
    unittest.main()


class IntegrityClassificationTests(unittest.TestCase):
    """A proven-bad artifact must never survive as `verified`.

    These cover the gap that motivated integrity checking: every record below
    passes the exit-code, size, and age gates -- the classifier's entire prior
    vocabulary -- and is distinguished only by what reading the file found.
    """

    def _artifact(self, integrity=None):
        artifact = {
            "exists": True,
            "size_bytes": 5_000_000,
            "modified_at": "2026-08-24T02:58:00Z",
        }
        if integrity is not None:
            artifact["integrity"] = integrity
        return artifact

    def test_corrupt_artifact_is_failed_despite_clean_exit_size_and_age(self):
        record = run(
            artifact=self._artifact({"result": "corrupt", "format": "tar.gz", "detail": "the tar stream ended mid-archive"}),
            expected={"max_age_hours": 26, "min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "failed")
        self.assertIn("not intact", result["reasons"][0])
        self.assertIn("ended mid-archive", result["reasons"][0])

    def test_identical_record_without_the_integrity_check_is_verified(self):
        # The control for the case above: same exit code, same size, same age.
        # Only reading the artifact tells the two runs apart, which is the whole
        # argument for doing it.
        result = classify_run(
            run(artifact=self._artifact(), expected={"max_age_hours": 26, "min_size_bytes": 1000})
        )
        self.assertEqual(result["status"], "verified")

    def test_intact_artifact_is_verified_and_says_so(self):
        record = run(
            artifact=self._artifact({"result": "intact", "format": "tar.gz", "detail": "walked all 4 member(s)"}),
            expected={"max_age_hours": 26, "min_size_bytes": 1000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "verified")
        self.assertIn("structurally intact", result["reasons"][0])

    def test_verified_without_integrity_states_that_nothing_was_opened(self):
        result = classify_run(run(artifact=self._artifact()))
        self.assertEqual(result["status"], "verified")
        self.assertIn("not opened or checked", result["reasons"][0])

    def test_unsupported_format_still_verifies_but_discloses_the_gap(self):
        record = run(
            artifact=self._artifact(
                {"result": "unsupported", "format": "zstd", "detail": "zstd is not in the standard library"}
            )
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "verified")
        self.assertIn("not checked", result["reasons"][0])

    def test_inconclusive_integrity_makes_the_run_suspicious(self):
        # Failing loud: if the artifact could not be read, that is worth a look,
        # not a green tick.
        record = run(
            artifact=self._artifact(
                {"result": "inconclusive", "format": "gzip", "detail": "permission denied"}
            )
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "suspicious")
        self.assertIn("could not be established", result["reasons"][0])

    def test_corrupt_outranks_a_size_shortfall_in_the_reported_reason(self):
        # Both problems are real; the corrupt one is the one that explains the
        # other, so it is what the operator should be told first.
        record = run(
            artifact=self._artifact({"result": "corrupt", "format": "gzip", "detail": "CRC check failed"}),
            expected={"min_size_bytes": 10_000_000},
        )
        result = classify_run(record)
        self.assertEqual(result["status"], "failed")
        self.assertIn("CRC check failed", result["reasons"][0])


class MarkdownEscapingTests(unittest.TestCase):
    def test_pipes_in_a_tool_name_do_not_shear_the_table_row(self):
        # `pg_dump|gzip` is both a realistic tool label and the exact pipeline
        # whose silent failure this venture exists to catch, so it must render.
        report = build_history_report(
            [run(tool="pg_dump|gzip", artifact={"exists": True, "size_bytes": 10})]
        )
        output = markdown_report(report)
        row = [line for line in output.splitlines() if "pg_dump" in line and line.startswith("|")][0]
        self.assertIn(r"pg_dump\|gzip", row)
        self.assertEqual(row.count("|") - row.count(r"\|"), 5)
