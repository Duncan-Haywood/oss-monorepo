#!/usr/bin/env python3
"""Tests for check.py.

Most of these pin the boundary the tool exists to draw: a workflow or job
that never declares its own `permissions:` runs with the ambient default and
is `unspecified`; one that declares `write-all` is flagged for granting every
scope; anything else that was declared on purpose is `explicit` and left
alone regardless of which scopes it lists.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import check as apc


class ScanTextWorkflowLevel(unittest.TestCase):
    def test_no_permissions_key_and_no_jobs_is_unspecified(self):
        text = "name: ci\non: push\n"
        findings = apc.scan_text(text, filename="wf.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], apc.UNSPECIFIED)
        self.assertEqual(findings[0]["scope"], "workflow")

    def test_workflow_level_write_all_is_flagged(self):
        text = "name: ci\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"]
        self.assertEqual(len(top), 1)
        self.assertEqual(top[0]["classification"], apc.WRITE_ALL)
        self.assertEqual(top[0]["line"], 2)

    def test_workflow_level_read_all_is_explicit(self):
        text = "permissions: read-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["classification"], apc.EXPLICIT)

    def test_workflow_level_block_mapping_is_explicit(self):
        text = "permissions:\n  contents: read\n  pull-requests: write\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["classification"], apc.EXPLICIT)
        self.assertIn("contents: read", top["detail"])
        self.assertIn("pull-requests: write", top["detail"])

    def test_empty_block_mapping_is_explicit_no_scopes(self):
        text = "permissions: {}\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["classification"], apc.EXPLICIT)


class ScanTextJobLevel(unittest.TestCase):
    def test_job_with_no_permissions_and_no_workflow_level_is_unspecified(self):
        text = "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n"
        findings = apc.scan_text(text, filename="wf.yml")
        job = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(job["classification"], apc.UNSPECIFIED)

    def test_job_inherits_explicit_workflow_level_grant(self):
        text = "permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        job = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(job["classification"], apc.EXPLICIT)
        self.assertIn("inherited", job["detail"])

    def test_job_inherits_write_all_from_workflow_level(self):
        text = "permissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        job = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(job["classification"], apc.WRITE_ALL)

    def test_job_level_permissions_overrides_workflow_level(self):
        text = (
            "permissions: write-all\n"
            "jobs:\n"
            "  build:\n"
            "    permissions:\n"
            "      contents: read\n"
            "    runs-on: ubuntu-latest\n"
        )
        findings = apc.scan_text(text, filename="wf.yml")
        job = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(job["classification"], apc.EXPLICIT)

    def test_job_level_write_all_is_flagged_even_with_scoped_workflow_level(self):
        text = (
            "permissions:\n"
            "  contents: read\n"
            "jobs:\n"
            "  build:\n"
            "    permissions: write-all\n"
            "    runs-on: ubuntu-latest\n"
        )
        findings = apc.scan_text(text, filename="wf.yml")
        job = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(job["classification"], apc.WRITE_ALL)

    def test_multiple_jobs_each_scanned_independently(self):
        text = (
            "jobs:\n"
            "  build:\n"
            "    permissions:\n"
            "      contents: read\n"
            "    runs-on: ubuntu-latest\n"
            "  deploy:\n"
            "    runs-on: ubuntu-latest\n"
        )
        findings = apc.scan_text(text, filename="wf.yml")
        build = [f for f in findings if f["scope"] == "job:build"][0]
        deploy = [f for f in findings if f["scope"] == "job:deploy"][0]
        self.assertEqual(build["classification"], apc.EXPLICIT)
        self.assertEqual(deploy["classification"], apc.UNSPECIFIED)

    def test_last_job_end_boundary_does_not_leak_into_trailing_top_level_content(self):
        # `permissions:` appearing after `jobs:` at column 0 is still
        # workflow-level, not the last job's -- this pins the end-index fix.
        text = (
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "permissions:\n"
            "  contents: read\n"
        )
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["classification"], apc.EXPLICIT)
        build = [f for f in findings if f["scope"] == "job:build"][0]
        self.assertEqual(build["classification"], apc.EXPLICIT)
        self.assertIn("inherited", build["detail"])


class ScanTextMisc(unittest.TestCase):
    def test_line_numbers_are_one_indexed_and_correct(self):
        text = "name: ci\non: push\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["line"], 3)

    def test_commented_permissions_line_is_ignored(self):
        text = "# permissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"]
        self.assertEqual(top, [])

    def test_inline_comment_after_permissions_value_is_tolerated(self):
        text = "permissions: write-all  # TODO narrow this\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        findings = apc.scan_text(text, filename="wf.yml")
        top = [f for f in findings if f["scope"] == "workflow"][0]
        self.assertEqual(top["classification"], apc.WRITE_ALL)


class DiscoverWorkflowFiles(unittest.TestCase):
    def test_finds_yml_and_yaml_under_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = os.path.join(tmp, ".github", "workflows")
            os.makedirs(workflows)
            open(os.path.join(workflows, "a.yml"), "w").close()
            open(os.path.join(workflows, "b.yaml"), "w").close()
            open(os.path.join(workflows, "notes.txt"), "w").close()
            files = apc.discover_workflow_files(tmp)
            names = sorted(os.path.basename(f) for f in files)
            self.assertEqual(names, ["a.yml", "b.yaml"])

    def test_missing_workflows_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(apc.discover_workflow_files(tmp), [])


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
                    "ci.yml": "jobs:\n  build:\n    runs-on: ubuntu-latest\n",
                    "deploy.yaml": "permissions: write-all\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n",
                },
            )
            findings = apc.scan_path(tmp)
            files = {f["file"] for f in findings}
            self.assertEqual(len(files), 2)


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_when_write_all_present(self):
        findings = [{"classification": apc.EXPLICIT}, {"classification": apc.WRITE_ALL}]
        self.assertTrue(apc.has_unresolved_risk(findings))

    def test_true_when_unspecified_present(self):
        findings = [{"classification": apc.UNSPECIFIED}]
        self.assertTrue(apc.has_unresolved_risk(findings))

    def test_false_when_all_explicit(self):
        findings = [{"classification": apc.EXPLICIT}]
        self.assertFalse(apc.has_unresolved_risk(findings))

    def test_false_on_empty(self):
        self.assertFalse(apc.has_unresolved_risk([]))


class Main(unittest.TestCase):
    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = apc.main(argv)
        return code, buf.getvalue()

    def make_repo(self, tmp, text):
        workflows = os.path.join(tmp, ".github", "workflows")
        os.makedirs(workflows)
        with open(os.path.join(workflows, "ci.yml"), "w", encoding="utf-8") as handle:
            handle.write(text)

    def test_clean_repo_exits_zero_even_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("already explicit", out)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "jobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("risky finding(s)", out)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "jobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, _out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_clean_repo_with_fail_on_risk_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, _out = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 0)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "jobs:\n  build:\n    runs-on: ubuntu-latest\n")
            code, out = self.run_main([tmp, "--format", "json"])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(len(data), 1)
            self.assertEqual(
                set(data[0]),
                {"file", "line", "scope", "classification", "detail"},
            )
            self.assertEqual(data[0]["classification"], "unspecified")

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
