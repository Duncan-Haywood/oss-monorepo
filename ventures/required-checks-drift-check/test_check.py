#!/usr/bin/env python3
"""Tests for check.py.

The boundary this tool exists to draw: a required status check name is
`current` only if some job in the scanned workflow(s) would report a status
under that exact name on a pull request today. Everything else -- a rename,
a removed job, a workflow that dropped its `pull_request` trigger, or a
matrix/reusable-workflow name this tool cannot enumerate -- must be reported
as something other than a silent pass, because a silent pass is exactly the
state branch protection is already in when this problem bites.
"""

import json
import tempfile
import unittest
from pathlib import Path

import check as rcd


class ParseTriggers(unittest.TestCase):
    def test_scalar_trigger(self):
        self.assertEqual(rcd.parse_triggers("on: push\njobs:\n"), {"push"})

    def test_flow_list_trigger(self):
        self.assertEqual(rcd.parse_triggers("on: [push, pull_request]\n"), {"push", "pull_request"})

    def test_block_mapping_trigger(self):
        text = "on:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  x:\n"
        self.assertEqual(rcd.parse_triggers(text), {"push", "pull_request"})

    def test_block_list_trigger(self):
        text = "on:\n  - push\n  - workflow_dispatch\njobs:\n"
        self.assertEqual(rcd.parse_triggers(text), {"push", "workflow_dispatch"})

    def test_missing_on_is_empty(self):
        self.assertEqual(rcd.parse_triggers("jobs:\n  x:\n    runs-on: ubuntu-latest\n"), set())


class ScanText(unittest.TestCase):
    def test_simple_job_uses_id_as_name(self):
        text = "on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]["base_name"], "lint")
        self.assertEqual(reports[0]["check_names"], ["lint"])
        self.assertTrue(reports[0]["runs_on_pr"])

    def test_name_field_overrides_job_id(self):
        text = "on: pull_request\njobs:\n  build:\n    name: Build and Test\n    runs-on: ubuntu-latest\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(reports[0]["base_name"], "Build and Test")
        self.assertEqual(reports[0]["check_names"], ["Build and Test"])

    def test_quoted_name_is_unquoted(self):
        text = 'on: pull_request\njobs:\n  build:\n    name: "Build & Test"\n    runs-on: ubuntu-latest\n'
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(reports[0]["base_name"], "Build & Test")

    def test_workflow_without_pull_request_trigger_is_flagged(self):
        text = "on: push\njobs:\n  release:\n    runs-on: ubuntu-latest\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertFalse(reports[0]["runs_on_pr"])

    def test_pull_request_target_counts_as_pr_trigger(self):
        text = "on: pull_request_target\njobs:\n  x:\n    runs-on: ubuntu-latest\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertTrue(reports[0]["runs_on_pr"])

    def test_multiple_jobs(self):
        text = "on: pull_request\njobs:\n  a:\n    runs-on: ubuntu-latest\n  b:\n    runs-on: ubuntu-latest\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual([r["job_id"] for r in reports], ["a", "b"])

    def test_no_jobs_key_returns_empty(self):
        self.assertEqual(rcd.scan_text("on: push\n", "w.yml"), [])

    def test_flow_matrix_expands_cartesian(self):
        text = (
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix:\n        node: [16, 18, 20]\n"
        )
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(
            reports[0]["check_names"],
            ["test (16)", "test (18)", "test (20)"],
        )

    def test_block_sequence_matrix(self):
        text = (
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix:\n        node:\n          - 16\n          - 18\n"
        )
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(reports[0]["check_names"], ["test (16)", "test (18)"])

    def test_multi_axis_matrix_is_full_cartesian_product(self):
        text = (
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n"
            "        node: [16, 18]\n"
        )
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual(
            reports[0]["check_names"],
            [
                "test (ubuntu-latest, 16)",
                "test (ubuntu-latest, 18)",
                "test (macos-latest, 16)",
                "test (macos-latest, 18)",
            ],
        )

    def test_dynamic_matrix_expression_is_unenumerable(self):
        text = (
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}\n"
        )
        reports = rcd.scan_text(text, "w.yml")
        self.assertTrue(reports[0]["dynamic"])
        self.assertIsNone(reports[0]["check_names"])

    def test_matrix_with_include_is_unenumerable(self):
        text = (
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix:\n        node: [16, 18]\n        include:\n          - node: 20\n"
        )
        reports = rcd.scan_text(text, "w.yml")
        self.assertTrue(reports[0]["dynamic"])

    def test_reusable_workflow_call_is_flagged_not_computed(self):
        text = "on: pull_request\njobs:\n  call:\n    uses: ./.github/workflows/shared.yml\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertTrue(reports[0]["reusable"])
        self.assertIsNone(reports[0]["check_names"])

    def test_job_after_jobs_block_is_not_included(self):
        # A top-level key after `jobs:` (e.g. `env:` placed last) must not be
        # mistaken for another job.
        text = "on: pull_request\njobs:\n  a:\n    runs-on: ubuntu-latest\nenv:\n  FOO: bar\n"
        reports = rcd.scan_text(text, "w.yml")
        self.assertEqual([r["job_id"] for r in reports], ["a"])


class ParseRequiredChecks(unittest.TestCase):
    def test_plain_lines(self):
        self.assertEqual(rcd.parse_required_checks("lint\nbuild\n"), ["lint", "build"])

    def test_bullet_prefix_stripped(self):
        self.assertEqual(rcd.parse_required_checks("- lint\n- build\n"), ["lint", "build"])

    def test_blank_lines_ignored(self):
        self.assertEqual(rcd.parse_required_checks("lint\n\n\nbuild\n"), ["lint", "build"])

    def test_bare_json_list(self):
        self.assertEqual(rcd.parse_required_checks(json.dumps(["lint", "build"])), ["lint", "build"])

    def test_branch_protection_contexts_shape(self):
        payload = json.dumps({"required_status_checks": {"contexts": ["lint", "build"]}})
        self.assertEqual(rcd.parse_required_checks(payload), ["lint", "build"])

    def test_flat_contexts_shape(self):
        payload = json.dumps({"contexts": ["lint", "build"]})
        self.assertEqual(rcd.parse_required_checks(payload), ["lint", "build"])

    def test_checks_array_shape(self):
        payload = json.dumps({"checks": [{"context": "lint", "app_id": 15368}, {"context": "build"}]})
        self.assertEqual(rcd.parse_required_checks(payload), ["lint", "build"])


class Compare(unittest.TestCase):
    def setUp(self):
        self.reports = rcd.scan_text(
            "on: [push, pull_request]\njobs:\n"
            "  build:\n    name: Build and Test\n    runs-on: ubuntu-latest\n"
            "  lint:\n    runs-on: ubuntu-latest\n",
            "ci.yml",
        ) + rcd.scan_text(
            "on: push\njobs:\n  release:\n    runs-on: ubuntu-latest\n",
            "deploy.yml",
        )

    def test_matching_name_is_current(self):
        results = rcd.compare(["Build and Test", "lint"], self.reports)
        self.assertTrue(all(r["status"] == rcd.CURRENT for r in results))

    def test_unmatched_name_is_stale(self):
        results = rcd.compare(["old-job-name"], self.reports)
        self.assertEqual(results[0]["status"], rcd.STALE)
        self.assertIn("Waiting for status", results[0]["note"])

    def test_matched_job_without_pr_trigger_is_flagged(self):
        results = rcd.compare(["release"], self.reports)
        self.assertEqual(results[0]["status"], rcd.NO_PR_TRIGGER)

    def test_has_stale_detects_any_stale(self):
        results = rcd.compare(["lint", "gone"], self.reports)
        self.assertTrue(rcd.has_stale(results))

    def test_has_stale_false_when_clean(self):
        results = rcd.compare(["lint", "Build and Test"], self.reports)
        self.assertFalse(rcd.has_stale(results))

    def test_dynamic_matrix_base_prefix_match_is_unverifiable(self):
        reports = rcd.scan_text(
            "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n"
            "    strategy:\n      matrix: ${{ fromJson(x) }}\n",
            "w.yml",
        )
        results = rcd.compare(["test (foo, bar)"], reports)
        self.assertEqual(results[0]["status"], rcd.UNVERIFIABLE)

    def test_reusable_call_prefix_match_is_unverifiable(self):
        reports = rcd.scan_text(
            "on: pull_request\njobs:\n  call:\n    uses: ./.github/workflows/shared.yml\n",
            "w.yml",
        )
        results = rcd.compare(["call / build"], reports)
        self.assertEqual(results[0]["status"], rcd.UNVERIFIABLE)


class ScanPathAndMain(unittest.TestCase):
    def test_scan_path_reads_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n")
            reports = rcd.scan_path(tmp)
            self.assertEqual(len(reports), 1)
            self.assertEqual(reports[0]["job_id"], "lint")

    def test_scan_path_missing_directory_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(rcd.scan_path(tmp), [])

    def test_main_exit_code_with_fail_on_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n")
            required = Path(tmp) / "required.txt"
            required.write_text("lint\nmissing-job\n")
            code = rcd.main([tmp, "--required-checks", str(required), "--fail-on-stale"])
            self.assertEqual(code, 2)

    def test_main_exit_code_zero_without_fail_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n")
            required = Path(tmp) / "required.txt"
            required.write_text("missing-job\n")
            code = rcd.main([tmp, "--required-checks", str(required)])
            self.assertEqual(code, 0)

    def test_json_format_is_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf_dir = Path(tmp) / ".github" / "workflows"
            wf_dir.mkdir(parents=True)
            (wf_dir / "ci.yml").write_text("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n")
            import io
            import contextlib

            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rcd.main([tmp, "--format", "json"])
            payload = json.loads(buf.getvalue())
            self.assertEqual(len(payload["jobs"]), 1)
            self.assertIsNone(payload["results"])


if __name__ == "__main__":
    unittest.main()
