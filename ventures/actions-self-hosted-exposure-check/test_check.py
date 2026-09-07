#!/usr/bin/env python3
"""Tests for check.py.

Most of these pin the boundary the tool exists to draw: a job running on a
`self-hosted` label, in a workflow triggered by one of the four risky
events, is `fork-exposed`; the same label under any other trigger, or any
non-self-hosted `runs-on:`, is not.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import check as ashec


class ExtractOnEventsViaScanText(unittest.TestCase):
    def test_scalar_on(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        job = findings[0]
        self.assertEqual(job["classification"], ashec.FORK_EXPOSED)

    def test_flow_sequence_on(self):
        text = "on: [push, pull_request]\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)

    def test_block_mapping_on_only_takes_shallowest_keys(self):
        text = (
            "on:\n"
            "  push:\n"
            "    branches: [main]\n"
            "  workflow_dispatch:\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on: self-hosted\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        # push + workflow_dispatch only -- "branches" must not be read as an event.
        self.assertEqual(findings[0]["classification"], ashec.SELF_HOSTED_OTHER_TRIGGER)

    def test_block_mapping_on_with_risky_trigger(self):
        text = (
            "on:\n"
            "  pull_request_target:\n"
            "    types: [opened]\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on: self-hosted\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)
        self.assertIn("pull_request_target", findings[0]["detail"])


class ClassifyRunsOn(unittest.TestCase):
    def test_github_hosted_scalar_not_flagged(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.GITHUB_HOSTED)

    def test_self_hosted_in_flow_list_is_flagged(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on: [self-hosted, linux, x64]\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)

    def test_self_hosted_in_block_sequence_is_flagged(self):
        text = (
            "on: pull_request\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on:\n"
            "      - self-hosted\n"
            "      - linux\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)

    def test_self_hosted_only_flags_the_literal_label(self):
        # "self-hosted-pool" is not the literal label GitHub assigns.
        text = "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted-pool\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.GITHUB_HOSTED)

    def test_self_hosted_with_safe_trigger_not_flagged(self):
        text = "on: push\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.SELF_HOSTED_OTHER_TRIGGER)

    def test_self_hosted_with_workflow_dispatch_not_flagged(self):
        text = "on: workflow_dispatch\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.SELF_HOSTED_OTHER_TRIGGER)

    def test_self_hosted_with_issue_comment_is_flagged(self):
        text = "on: issue_comment\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)

    def test_self_hosted_with_workflow_run_is_flagged(self):
        text = "on: workflow_run\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)

    def test_group_form_is_disclosed_as_unknown(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on:\n      group: my-runner-group\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.RUNNER_GROUP)

    def test_inline_flow_mapping_group_form_is_disclosed_as_unknown(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on: {group: my-runner-group}\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.RUNNER_GROUP)

    def test_dynamic_expression_is_disclosed_as_unknown(self):
        text = (
            "on: pull_request\n"
            "jobs:\n"
            "  build:\n"
            "    strategy:\n"
            "      matrix:\n"
            "        os: [ubuntu-latest]\n"
            "    runs-on: ${{ matrix.os }}\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.DYNAMIC)

    def test_no_runs_on_at_all(self):
        text = "on: pull_request\njobs:\n  build:\n    steps:\n      - run: echo hi\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.NO_RUNS_ON)

    def test_empty_runs_on_block(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on:\n    steps:\n      - run: echo hi\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.NO_RUNS_ON)


class NoJobsOrMultipleJobs(unittest.TestCase):
    def test_no_jobs_section(self):
        text = "on: pull_request\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], ashec.NO_JOBS)
        self.assertEqual(findings[0]["scope"], "workflow")

    def test_multiple_jobs_each_scanned_independently(self):
        text = (
            "on: pull_request\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "  deploy:\n"
            "    runs-on: self-hosted\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        build = [f for f in findings if f["scope"] == "job:build"][0]
        deploy = [f for f in findings if f["scope"] == "job:deploy"][0]
        self.assertEqual(build["classification"], ashec.GITHUB_HOSTED)
        self.assertEqual(deploy["classification"], ashec.FORK_EXPOSED)

    def test_last_job_end_boundary_does_not_leak_into_trailing_top_level_content(self):
        text = (
            "on: pull_request\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on: self-hosted\n"
            "permissions:\n"
            "  contents: read\n"
        )
        findings = ashec.scan_text(text, filename="wf.yml")
        build = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(build["classification"], ashec.FORK_EXPOSED)


class ScanTextMisc(unittest.TestCase):
    def test_line_numbers_are_one_indexed_and_correct(self):
        text = "name: ci\non: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["line"], 4)

    def test_commented_runs_on_line_is_ignored(self):
        text = "on: pull_request\njobs:\n  build:\n    # runs-on: self-hosted\n    runs-on: ubuntu-latest\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.GITHUB_HOSTED)

    def test_inline_comment_after_runs_on_value_is_tolerated(self):
        text = "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted  # our office runner\n"
        findings = ashec.scan_text(text, filename="wf.yml")
        self.assertEqual(findings[0]["classification"], ashec.FORK_EXPOSED)


class DiscoverWorkflowFiles(unittest.TestCase):
    def test_finds_yml_and_yaml_under_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = os.path.join(tmp, ".github", "workflows")
            os.makedirs(workflows)
            open(os.path.join(workflows, "a.yml"), "w").close()
            open(os.path.join(workflows, "b.yaml"), "w").close()
            open(os.path.join(workflows, "notes.txt"), "w").close()
            files = ashec.discover_workflow_files(tmp)
            names = sorted(os.path.basename(f) for f in files)
            self.assertEqual(names, ["a.yml", "b.yaml"])

    def test_missing_workflows_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(ashec.discover_workflow_files(tmp), [])


class ScanPath(unittest.TestCase):
    def make_repo(self, tmp, contents):
        workflows = os.path.join(tmp, ".github", "workflows")
        os.makedirs(workflows)
        for name, text in contents.items():
            with open(os.path.join(workflows, name), "w", encoding="utf-8") as handle:
                handle.write(text)

    def test_scans_every_workflow_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(
                tmp,
                {
                    "ci.yml": "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n",
                    "deploy.yaml": "on: pull_request\njobs:\n  deploy:\n    runs-on: self-hosted\n",
                },
            )
            findings = ashec.scan_path(tmp)
            files = {f["file"] for f in findings}
            self.assertEqual(len(files), 2)


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_when_fork_exposed_present(self):
        findings = [{"classification": ashec.GITHUB_HOSTED}, {"classification": ashec.FORK_EXPOSED}]
        self.assertTrue(ashec.has_unresolved_risk(findings))

    def test_false_when_none_exposed(self):
        findings = [{"classification": ashec.GITHUB_HOSTED}, {"classification": ashec.SELF_HOSTED_OTHER_TRIGGER}]
        self.assertFalse(ashec.has_unresolved_risk(findings))

    def test_false_on_empty(self):
        self.assertFalse(ashec.has_unresolved_risk([]))


class Main(unittest.TestCase):
    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = ashec.main(argv)
        return code, buf.getvalue()

    def make_repo(self, tmp, text):
        workflows = os.path.join(tmp, ".github", "workflows")
        os.makedirs(workflows)
        with open(os.path.join(workflows, "ci.yml"), "w", encoding="utf-8") as handle:
            handle.write(text)

    def test_clean_repo_exits_zero_even_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("0 fork-exposed", out)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("fork-exposed finding(s)", out)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n")
            code, _out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_clean_repo_with_fail_on_risk_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, _out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 0)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n")
            code, out = self.run_main([tmp, "--format", "json"])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(len(data), 1)
            self.assertEqual(
                set(data[0]),
                {"file", "line", "scope", "classification", "detail"},
            )
            self.assertEqual(data[0]["classification"], "fork-exposed")

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("No .github/workflows", out)

    def test_default_path_is_current_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            try:
                os.chdir(tmp)
                code, _out = self.run_main([])
                self.assertEqual(code, 0)
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
