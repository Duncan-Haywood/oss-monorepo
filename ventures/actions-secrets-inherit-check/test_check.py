import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


class ScanTextExternalWorkflow(unittest.TestCase):
    EXTERNAL_WORKFLOW = """\
on: push
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
    secrets: inherit
"""

    def test_flags_secrets_inherit_on_external_reusable_workflow(self):
        findings = check.scan_text(self.EXTERNAL_WORKFLOW)
        external = [f for f in findings if f["type"] == check.SECRETS_INHERIT_EXTERNAL_WORKFLOW]
        self.assertEqual(len(external), 1)
        self.assertEqual(external[0]["line"], 5)
        self.assertIn("octo-org/example-repo", external[0]["detail"])

    def test_local_reusable_workflow_is_not_flagged_as_external(self):
        text = self.EXTERNAL_WORKFLOW.replace(
            "octo-org/example-repo/.github/workflows/reusable.yml@main",
            "./.github/workflows/reusable.yml",
        )
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.SECRETS_INHERIT_EXTERNAL_WORKFLOW], [])

    def test_named_secrets_on_external_workflow_is_not_flagged(self):
        text = self.EXTERNAL_WORKFLOW.replace(
            "secrets: inherit", "secrets:\n      TOKEN: ${{ secrets.TOKEN }}"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_ordinary_action_with_a_uses_but_no_workflows_path_is_ignored(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
"""
        self.assertEqual(check.scan_text(text), [])

    def test_secrets_inherit_belonging_to_an_unrelated_later_job_is_not_attributed(self):
        text = """\
on: push
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
  other-job:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
    secrets: inherit
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.SECRETS_INHERIT_EXTERNAL_WORKFLOW], [])


class ScanTextUntrustedTrigger(unittest.TestCase):
    def test_flags_secrets_inherit_reachable_from_pull_request_target(self):
        text = """\
on:
  pull_request_target:
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
"""
        findings = check.scan_text(text)
        untrusted = [f for f in findings if f["type"] == check.SECRETS_INHERIT_UNTRUSTED_TRIGGER]
        self.assertEqual(len(untrusted), 1)
        self.assertEqual(untrusted[0]["line"], 6)

    def test_workflow_run_trigger_also_flags(self):
        text = """\
on:
  workflow_run:
    workflows: [ci]
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
"""
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.SECRETS_INHERIT_UNTRUSTED_TRIGGER]), 1)

    def test_same_call_under_plain_push_is_not_flagged_as_untrusted(self):
        text = """\
on: push
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.SECRETS_INHERIT_UNTRUSTED_TRIGGER], [])

    def test_external_call_on_untrusted_trigger_flags_both_types(self):
        text = """\
on:
  pull_request_target:
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
    secrets: inherit
"""
        findings = check.scan_text(text)
        types = sorted(f["type"] for f in findings)
        self.assertEqual(
            types,
            sorted([check.SECRETS_INHERIT_EXTERNAL_WORKFLOW, check.SECRETS_INHERIT_UNTRUSTED_TRIGGER]),
        )


class DiscoverAndScanPath(unittest.TestCase):
    def test_finds_yml_and_yaml_under_dot_github_workflows(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "a.yml").write_text("on: push\n")
            (workflows / "b.yaml").write_text("on: push\n")
            (workflows / "notes.txt").write_text("ignore me\n")
            files = check.discover_workflow_files(tmp)
            self.assertEqual([p.name for p in files], ["a.yml", "b.yaml"])

    def test_missing_workflows_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.discover_workflow_files(tmp), [])

    def test_scans_every_workflow_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            workflows = Path(tmp) / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "a.yml").write_text(
                "on: push\njobs:\n  b:\n    uses: octo-org/repo/.github/workflows/r.yml@main\n"
                "    secrets: inherit\n"
            )
            (workflows / "b.yml").write_text("on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n")
            findings = check.scan_path(tmp)
            self.assertEqual(len(findings), 1)


class Main(unittest.TestCase):
    def _write_repo(self, tmp, workflow_text):
        workflows = Path(tmp) / ".github" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "ci.yml").write_text(workflow_text)

    def test_clean_repo_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(tmp, "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n")
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 0)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: push\njobs:\n  b:\n    uses: octo-org/repo/.github/workflows/r.yml@main\n"
                "    secrets: inherit\n",
            )
            self.assertEqual(check.main([tmp]), 0)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: push\njobs:\n  b:\n    uses: octo-org/repo/.github/workflows/r.yml@main\n"
                "    secrets: inherit\n",
            )
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 2)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: push\njobs:\n  b:\n    uses: octo-org/repo/.github/workflows/r.yml@main\n"
                "    secrets: inherit\n",
            )
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], "secrets-inherit-external-workflow")

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.main([tmp]), 0)


if __name__ == "__main__":
    unittest.main()
