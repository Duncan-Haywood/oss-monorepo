import io
import json
import os
from pathlib import Path
import tempfile
import unittest

from shootflow.cli import main
from shootflow.pilot_cohort_report import (
    PilotCohortReportError,
    build_pilot_cohort_report_from_paths,
    pilot_cohort_report_to_dict,
)


class PilotCohortReportTests(unittest.TestCase):
    def test_cohort_report_aggregates_ready_rate_intervention_median_and_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ready = self._write_dashboard(
                root,
                "ready.json",
                shoot_slug="ready-shoot",
                workspace="/shoots/ready",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=0,
                output_count=4,
            )
            review = self._write_dashboard(
                root,
                "review.json",
                shoot_slug="review-shoot",
                workspace="/shoots/review",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=7500,
                intervention_rate=2500,
                output_count=1,
            )
            unavailable = self._write_dashboard(
                root,
                "unavailable.json",
                shoot_slug="unavailable-shoot",
                workspace="/shoots/unavailable",
                metrics_available=False,
                ready_for_review=False,
                completion_rate=None,
                intervention_rate=None,
                output_count=None,
            )

            report = build_pilot_cohort_report_from_paths(
                [ready, review, unavailable],
                generated_at="2026-05-09T21:31:00Z",
            )
            payload = pilot_cohort_report_to_dict(report)

        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["generated_at"], "2026-05-09T21:31:00Z")
        self.assertEqual(payload["cohort"]["dashboard_count"], 3)
        self.assertEqual(payload["cohort"]["metrics_available_dashboard_count"], 2)
        self.assertEqual(payload["cohort"]["metrics_unavailable_dashboard_count"], 1)
        self.assertEqual(payload["cohort"]["pilot_ready_workspace_count"], 1)
        self.assertEqual(payload["cohort"]["pilot_ready_workspace_rate_basis_points"], 5000)
        self.assertEqual(payload["cohort"]["median_intervention_rate_basis_points"], 1250)
        self.assertEqual(payload["cohort"]["first_draft_output_count"], 5)
        self.assertEqual(
            payload["cohort"]["readiness_blockers"],
            {
                "metrics_unavailable": 1,
                "completion_below_threshold": 1,
                "intervention_above_threshold": 1,
                "materialized_outputs_missing": 0,
            },
        )
        self.assertEqual(
            payload["workflow_authority"],
            {
                "mode": "observe_only",
                "handoff_kind": "presentation_only",
                "permits_file_mutation": False,
                "permits_copy": False,
                "permits_retry": False,
                "permits_cleanup": False,
                "permits_overwrite": False,
                "permits_materialization": False,
                "permits_deletion": False,
            },
        )
        self.assertEqual(payload["workspaces"][0]["shoot_slug"], "ready-shoot")
        self.assertTrue(payload["workspaces"][0]["ready_for_pilot_review"])
        self.assertFalse(payload["workspaces"][1]["ready_for_pilot_review"])
        self.assertEqual(
            payload["workspaces"][1]["readiness_blockers"],
            ["completion_below_threshold", "intervention_above_threshold"],
        )
        self.assertFalse(payload["workspaces"][2]["metrics_available"])
        self.assertEqual(payload["workspaces"][2]["readiness_blockers"], ["metrics_unavailable"])
        self.assertIn("read-only", " ".join(payload["safety_notes"]))
        self.assertIn("does not authorize workflow actions", " ".join(payload["safety_notes"]))

    def test_cohort_report_counts_structured_readiness_blockers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "blocked.json",
                shoot_slug="blocked-shoot",
                workspace="/shoots/blocked",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=7500,
                intervention_rate=2500,
                output_count=0,
            )

            payload = pilot_cohort_report_to_dict(
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:15Z",
                )
            )

        self.assertEqual(
            payload["cohort"]["readiness_blockers"],
            {
                "metrics_unavailable": 0,
                "completion_below_threshold": 1,
                "intervention_above_threshold": 1,
                "materialized_outputs_missing": 1,
            },
        )
        self.assertEqual(
            payload["workspaces"][0]["readiness_blockers"],
            [
                "completion_below_threshold",
                "intervention_above_threshold",
                "materialized_outputs_missing",
            ],
        )

    def test_cohort_report_sums_repeated_blockers_across_workspaces(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = self._write_dashboard(
                root,
                "first-below-completion.json",
                shoot_slug="first-below-completion",
                workspace="/shoots/first-below-completion",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=7500,
                intervention_rate=0,
                output_count=1,
            )
            second = self._write_dashboard(
                root,
                "second-below-completion.json",
                shoot_slug="second-below-completion",
                workspace="/shoots/second-below-completion",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=8000,
                intervention_rate=0,
                output_count=1,
            )

            payload = pilot_cohort_report_to_dict(
                build_pilot_cohort_report_from_paths(
                    [first, second],
                    generated_at="2026-05-09T21:31:18Z",
                )
            )

        self.assertEqual(payload["cohort"]["readiness_blockers"]["completion_below_threshold"], 2)
        self.assertEqual(payload["cohort"]["readiness_blockers"]["intervention_above_threshold"], 0)
        self.assertEqual(payload["cohort"]["readiness_blockers"]["materialized_outputs_missing"], 0)

    def test_cohort_report_rejects_ready_dashboard_with_failed_threshold_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "forged-ready.json",
                shoot_slug="forged-ready",
                workspace="/shoots/forged-ready",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=0,
                output_count=2,
            )
            payload = json.loads(dashboard.read_text(encoding="utf-8"))
            payload["pilot_acceptance"]["meets_completion_threshold"] = False
            dashboard.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaisesRegex(PilotCohortReportError, "threshold"):
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:20Z",
                )

    def test_cohort_report_rejects_forged_ready_flag_with_consistent_threshold_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "forged-ready-flag.json",
                shoot_slug="forged-ready-flag",
                workspace="/shoots/forged-ready-flag",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=7500,
                intervention_rate=0,
                output_count=1,
            )
            payload = json.loads(dashboard.read_text(encoding="utf-8"))
            payload["pilot_acceptance"]["ready_for_pilot_review"] = True
            dashboard.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaisesRegex(PilotCohortReportError, "ready_for_pilot_review"):
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:22Z",
                )

    def test_cohort_report_rejects_dashboard_with_relaxed_acceptance_thresholds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "relaxed-thresholds.json",
                shoot_slug="relaxed-thresholds",
                workspace="/shoots/relaxed-thresholds",
                metrics_available=True,
                ready_for_review=False,
                completion_rate=0,
                intervention_rate=10000,
                output_count=0,
            )
            payload = json.loads(dashboard.read_text(encoding="utf-8"))
            payload["pilot_acceptance"]["thresholds"] = {
                "min_completion_rate_basis_points": 0,
                "max_intervention_rate_basis_points": 10000,
                "min_materialized_output_count": 0,
            }
            payload["pilot_acceptance"]["meets_completion_threshold"] = True
            payload["pilot_acceptance"]["meets_intervention_threshold"] = True
            payload["pilot_acceptance"]["meets_output_threshold"] = True
            payload["pilot_acceptance"]["ready_for_pilot_review"] = True
            dashboard.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaisesRegex(PilotCohortReportError, "default pilot acceptance"):
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:25Z",
                )

    def test_cohort_report_rejects_metrics_available_dashboard_missing_threshold_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "missing-threshold-flag.json",
                shoot_slug="missing-threshold-flag",
                workspace="/shoots/missing-threshold-flag",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=0,
                output_count=2,
            )
            payload = json.loads(dashboard.read_text(encoding="utf-8"))
            del payload["pilot_acceptance"]["meets_output_threshold"]
            dashboard.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaisesRegex(PilotCohortReportError, "threshold flags"):
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:27Z",
                )

    def test_cohort_report_keeps_rates_unavailable_without_trusted_dashboard_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "missing-metrics.json",
                shoot_slug="missing-metrics",
                workspace="/shoots/missing-metrics",
                metrics_available=False,
                ready_for_review=False,
                completion_rate=None,
                intervention_rate=None,
                output_count=None,
            )

            payload = pilot_cohort_report_to_dict(
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:30Z",
                )
            )

        self.assertEqual(payload["cohort"]["dashboard_count"], 1)
        self.assertEqual(payload["cohort"]["metrics_available_dashboard_count"], 0)
        self.assertEqual(payload["cohort"]["metrics_unavailable_dashboard_count"], 1)
        self.assertIsNone(payload["cohort"]["pilot_ready_workspace_rate_basis_points"])
        self.assertIsNone(payload["cohort"]["median_intervention_rate_basis_points"])
        self.assertEqual(payload["cohort"]["first_draft_output_count"], 0)
        self.assertFalse(payload["cohort"]["ready_for_pilot_review"])
        self.assertIn("trusted dashboard metrics", " ".join(payload["cohort"]["cohort_notes"]))

    def test_cohort_report_treats_partial_acceptance_metrics_as_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "partial-metrics.json",
                shoot_slug="partial-metrics",
                workspace="/shoots/partial-metrics",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=None,
                output_count=None,
            )

            payload = pilot_cohort_report_to_dict(
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:31:45Z",
                )
            )

        self.assertEqual(payload["cohort"]["metrics_available_dashboard_count"], 0)
        self.assertEqual(payload["cohort"]["metrics_unavailable_dashboard_count"], 1)
        self.assertEqual(payload["cohort"]["pilot_ready_workspace_count"], 0)
        self.assertIsNone(payload["cohort"]["pilot_ready_workspace_rate_basis_points"])
        self.assertIsNone(payload["cohort"]["median_intervention_rate_basis_points"])
        self.assertEqual(payload["cohort"]["first_draft_output_count"], 0)
        self.assertFalse(payload["workspaces"][0]["metrics_available"])
        self.assertFalse(payload["workspaces"][0]["ready_for_pilot_review"])
        self.assertIn("incomplete", " ".join(payload["workspaces"][0]["threshold_notes"]))

    def test_cli_prints_observe_only_cohort_report_without_rewriting_dashboards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "ready.json",
                shoot_slug="ready-shoot",
                workspace="/shoots/ready",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=0,
                output_count=2,
            )
            before = self._file_snapshot(root)

            stdout = io.StringIO()
            original_cwd = Path.cwd()
            try:
                os.chdir(root)
                exit_code = main(
                    [
                        "pilot-cohort-report",
                        "--dashboard-json",
                        str(dashboard),
                        "--generated-at",
                        "2026-05-09T21:32:00Z",
                    ],
                    stdout=stdout,
                )
            finally:
                os.chdir(original_cwd)
            payload = json.loads(stdout.getvalue())
            after = self._file_snapshot(root)

        self.assertEqual(exit_code, 0)
        self.assertEqual(after, before)
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["cohort"]["dashboard_count"], 1)
        self.assertTrue(payload["cohort"]["ready_for_pilot_review"])
        self.assertNotIn("command", json.dumps(payload, sort_keys=True))
        self.assertIn("dashboard JSON payloads", " ".join(payload["safety_notes"]))

    def test_cohort_report_rejects_malformed_saved_dashboard_authority_when_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dashboard = self._write_dashboard(
                root,
                "ready.json",
                shoot_slug="ready-shoot",
                workspace="/shoots/ready",
                metrics_available=True,
                ready_for_review=True,
                completion_rate=10000,
                intervention_rate=0,
                output_count=2,
            )
            payload = json.loads(dashboard.read_text(encoding="utf-8"))
            payload["workflow_authority"] = {
                "mode": "observe_only",
                "handoff_kind": "presentation_only",
                "permits_file_mutation": False,
                "permits_copy": False,
                "permits_retry": 0,
                "permits_cleanup": False,
                "permits_overwrite": False,
                "permits_materialization": False,
                "permits_deletion": False,
            }
            dashboard.write_text(json.dumps(payload, ensure_ascii=True, sort_keys=True), encoding="utf-8")

            with self.assertRaisesRegex(PilotCohortReportError, "workflow_authority"):
                build_pilot_cohort_report_from_paths(
                    [dashboard],
                    generated_at="2026-05-09T21:32:30Z",
                )

    def _write_dashboard(
        self,
        root: Path,
        name: str,
        *,
        shoot_slug: str,
        workspace: str,
        metrics_available: bool,
        ready_for_review: bool,
        completion_rate: int | None,
        intervention_rate: int | None,
        output_count: int | None,
    ) -> Path:
        path = root / name
        payload = {
            "schema_version": 2,
            "generated_at": "2026-05-09T21:30:00Z",
            "workspace": workspace,
            "shoot_slug": shoot_slug,
            "workflow_state": "ready_for_review" if ready_for_review else "needs_human_review",
            "next_action": {
                "name": "review_deliverables",
                "writes_files": False,
                "authority": "observe_only",
            },
            "metric_sources": {
                "production_scheduler_report": False,
                "render_scheduler_report": metrics_available,
            },
            "activation": {
                "production_plan_available": False,
                "production_status_trusted": False,
                "production_scheduler_report_trusted": False,
                "render_tasks_trusted": metrics_available,
                "render_status_trusted": metrics_available,
                "render_scheduler_report_trusted": metrics_available,
            },
            "throughput": {
                "total_work_count": 4 if metrics_available else None,
                "completed_work_count": 4 if ready_for_review else 3 if metrics_available else None,
                "attempted_work_count": 4 if metrics_available else None,
                "materialized_output_count": output_count,
                "scheduler_iteration_count": 1 if metrics_available else None,
            },
            "intervention": {
                "manual_intervention_count": 0 if ready_for_review else 1 if metrics_available else None,
                "retryable_work_count": 0,
                "failed_work_count": 0,
                "blocked_work_count": 0,
                "review_required_work_count": 0 if ready_for_review else 1 if metrics_available else None,
                "conflicted_lease_count": 0,
                "failure_message_count": 0,
                "intervention_rate_basis_count": 4 if metrics_available else None,
            },
            "pilot_acceptance": {
                "thresholds": {
                    "min_completion_rate_basis_points": 9000,
                    "max_intervention_rate_basis_points": 2000,
                    "min_materialized_output_count": 1,
                },
                "metrics_available": metrics_available,
                "completion_rate_basis_points": completion_rate,
                "intervention_rate_basis_points": intervention_rate,
                "materialized_output_count": output_count,
                "meets_completion_threshold": None if completion_rate is None else completion_rate >= 9000,
                "meets_intervention_threshold": (
                    None if intervention_rate is None else intervention_rate <= 2000
                ),
                "meets_output_threshold": None if output_count is None else output_count >= 1,
                "ready_for_pilot_review": ready_for_review,
                "threshold_notes": (
                    ["trusted dashboard metrics meet the default pilot acceptance thresholds"]
                    if ready_for_review
                    else ["trusted scheduler metrics are required before pilot acceptance can be evaluated"]
                    if not metrics_available
                    else ["completion rate is below the pilot acceptance threshold"]
                ),
            },
            "safety_notes": [
                "pilot-dashboard is read-only and consumes workspace-health instead of raw worker internals",
                "pilot acceptance thresholds are observational and do not authorize workflow actions",
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
