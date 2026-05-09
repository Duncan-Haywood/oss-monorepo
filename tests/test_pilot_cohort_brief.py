import io
import json
import os
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.pilot_cohort_brief import (
    PilotCohortBriefError,
    build_pilot_cohort_brief_from_report_path,
    pilot_cohort_brief_to_dict,
)


class PilotCohortBriefTests(unittest.TestCase):
    def test_brief_turns_saved_cohort_report_into_observe_only_ui_cards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=1,
                ready_for_review=False,
                unavailable_count=0,
            )

            brief = build_pilot_cohort_brief_from_report_path(report_path)
            payload = pilot_cohort_brief_to_dict(brief)

        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["cohort_report_path"], str(report_path))
        self.assertEqual(payload["source_generated_at"], "2026-05-09T22:30:00Z")
        self.assertEqual(payload["status"], "needs_operator_review")
        self.assertEqual(payload["headline"], "1/2 metrics-available workspaces are pilot-ready")
        self.assertEqual(payload["summary"]["pilot_ready_workspace_rate_label"], "50.0%")
        self.assertEqual(payload["summary"]["median_intervention_rate_label"], "12.5%")
        self.assertEqual(payload["summary"]["first_draft_output_count"], 5)
        self.assertEqual(payload["workspace_cards"][0]["title"], "ready-shoot")
        self.assertEqual(payload["workspace_cards"][0]["readiness_label"], "Ready for pilot review")
        self.assertEqual(payload["workspace_cards"][0]["completion_rate_label"], "100.0%")
        self.assertEqual(payload["workspace_cards"][1]["title"], "review-shoot")
        self.assertEqual(payload["workspace_cards"][1]["readiness_label"], "Needs operator review")
        self.assertIn("observe-only", " ".join(payload["safety_notes"]))
        self.assertNotIn("command", json.dumps(payload, sort_keys=True))

    def test_brief_keeps_percentages_unavailable_without_trusted_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=0,
                ready_for_review=False,
                unavailable_count=2,
                ready_rate=None,
                intervention_rate=None,
            )

            payload = pilot_cohort_brief_to_dict(
                build_pilot_cohort_brief_from_report_path(report_path)
            )

        self.assertEqual(payload["status"], "metrics_unavailable")
        self.assertEqual(payload["summary"]["pilot_ready_workspace_rate_label"], "unavailable")
        self.assertEqual(payload["summary"]["median_intervention_rate_label"], "unavailable")
        self.assertEqual(payload["workspace_cards"][0]["readiness_label"], "Metrics unavailable")
        self.assertFalse(payload["summary"]["ready_for_pilot_review"])

    def test_cli_prints_pilot_cohort_brief_without_rewriting_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=2,
                ready_for_review=True,
                unavailable_count=0,
                ready_rate=10000,
                intervention_rate=0,
            )
            before = self._file_snapshot(root)

            stdout = io.StringIO()
            original_cwd = Path.cwd()
            try:
                os.chdir(root)
                exit_code = main(
                    [
                        "pilot-cohort-brief",
                        "--cohort-report",
                        str(report_path),
                    ],
                    stdout=stdout,
                )
            finally:
                os.chdir(original_cwd)
            payload = json.loads(stdout.getvalue())
            after = self._file_snapshot(root)

        self.assertEqual(exit_code, 0)
        self.assertEqual(after, before)
        self.assertEqual(payload["status"], "ready_for_pilot_review")
        self.assertEqual(payload["headline"], "All 2 metrics-available workspaces are pilot-ready")
        self.assertNotIn("command", json.dumps(payload, sort_keys=True))

    def test_brief_rejects_forged_ready_report_with_no_metrics_available(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=0,
                ready_for_review=False,
                unavailable_count=2,
                ready_rate=None,
                intervention_rate=None,
            )
            payload = json.loads(report_path.read_text(encoding="utf-8"))
            payload["cohort"]["ready_for_pilot_review"] = True
            report_path.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaises(PilotCohortBriefError):
                build_pilot_cohort_brief_from_report_path(report_path)

    def test_brief_rejects_inconsistent_aggregate_counts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=1,
                ready_for_review=False,
                unavailable_count=0,
            )
            payload = json.loads(report_path.read_text(encoding="utf-8"))
            payload["cohort"]["dashboard_count"] = 99
            report_path.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaises(PilotCohortBriefError):
                build_pilot_cohort_brief_from_report_path(report_path)

    def test_brief_rejects_aggregate_counts_that_disagree_with_workspace_cards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_path = self._write_cohort_report(
                root,
                "pilot_cohort_report.json",
                ready_count=1,
                ready_for_review=False,
                unavailable_count=0,
            )
            payload = json.loads(report_path.read_text(encoding="utf-8"))
            payload["workspaces"][0]["metrics_available"] = False
            payload["workspaces"][0]["ready_for_pilot_review"] = False
            report_path.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaises(PilotCohortBriefError):
                build_pilot_cohort_brief_from_report_path(report_path)

    def _write_cohort_report(
        self,
        root: Path,
        name: str,
        *,
        ready_count: int,
        ready_for_review: bool,
        unavailable_count: int,
        ready_rate: int | None = 5000,
        intervention_rate: int | None = 1250,
    ) -> Path:
        path = root / name
        workspaces = [
            {
                "dashboard_path": str(root / "ready.json"),
                "workspace": "/shoots/ready",
                "shoot_slug": "ready-shoot",
                "metrics_available": unavailable_count == 0 or ready_rate is not None,
                "ready_for_pilot_review": ready_count > 0,
                "completion_rate_basis_points": 10000 if ready_rate is not None else None,
                "intervention_rate_basis_points": 0 if intervention_rate is not None else None,
                "materialized_output_count": 4 if ready_rate is not None else None,
                "threshold_notes": ["trusted dashboard metrics meet the default pilot acceptance thresholds"],
            },
            {
                "dashboard_path": str(root / "review.json"),
                "workspace": "/shoots/review",
                "shoot_slug": "review-shoot",
                "metrics_available": unavailable_count == 0,
                "ready_for_pilot_review": ready_count > 1,
                "completion_rate_basis_points": (
                    10000
                    if ready_count > 1 and unavailable_count == 0
                    else 7500
                    if unavailable_count == 0
                    else None
                ),
                "intervention_rate_basis_points": (
                    0
                    if ready_count > 1 and unavailable_count == 0
                    else 2500
                    if unavailable_count == 0
                    else None
                ),
                "materialized_output_count": 1 if unavailable_count == 0 else None,
                "threshold_notes": (
                    ["trusted dashboard metrics meet the default pilot acceptance thresholds"]
                    if ready_count > 1 and unavailable_count == 0
                    else ["completion rate is below the pilot acceptance threshold"]
                ),
            },
        ]
        payload = {
            "schema_version": 1,
            "generated_at": "2026-05-09T22:30:00Z",
            "cohort": {
                "dashboard_count": 2,
                "metrics_available_dashboard_count": 2 - unavailable_count,
                "metrics_unavailable_dashboard_count": unavailable_count,
                "pilot_ready_workspace_count": ready_count,
                "pilot_ready_workspace_rate_basis_points": ready_rate,
                "median_intervention_rate_basis_points": intervention_rate,
                "first_draft_output_count": 5 if ready_rate is not None else 0,
                "ready_for_pilot_review": ready_for_review,
                "cohort_notes": ["not every metrics-available workspace meets pilot acceptance thresholds"],
            },
            "workspaces": workspaces,
            "safety_notes": [
                "pilot-cohort-report is read-only and consumes saved pilot dashboard JSON payloads",
                "pilot-cohort-report does not authorize workflow actions",
            ],
        }
        path.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")
        return path

    def _file_snapshot(self, root: Path) -> dict[str, str]:
        return {
            str(path.relative_to(root)): path.read_text(encoding="utf-8")
            for path in sorted(root.rglob("*"))
            if path.is_file()
        }


if __name__ == "__main__":
    unittest.main()
