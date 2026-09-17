import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


class ScanTextArtifactExecuted(unittest.TestCase):
    RISKY_WORKFLOW = """\
name: handle
on:
  workflow_run:
    workflows: [build]
    types: [completed]
jobs:
  run-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: test-results
      - name: Run it
        run: |
          chmod +x ./test-results/run.sh
          ./test-results/run.sh
"""

    def test_flags_execution_after_download_in_the_same_job(self):
        findings = check.scan_text(self.RISKY_WORKFLOW)
        executed = [f for f in findings if f["type"] == check.ARTIFACT_EXECUTED]
        self.assertEqual(len(executed), 1)
        self.assertEqual(executed[0]["line"], 15)
        self.assertIn("line 11", executed[0]["detail"])

    def test_named_download_still_flags_execution(self):
        # A name: input avoids the unscoped-download finding but does nothing
        # to stop the artifact's contents from being untrusted.
        findings = check.scan_text(self.RISKY_WORKFLOW)
        self.assertEqual([f["type"] for f in findings], [check.ARTIFACT_EXECUTED])

    def test_dawidd6_third_party_action_also_flags(self):
        text = self.RISKY_WORKFLOW.replace(
            "uses: actions/download-artifact@v4", "uses: dawidd6/action-download-artifact@v3"
        )
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.ARTIFACT_EXECUTED]), 1)

    def test_plain_pull_request_trigger_is_not_flagged(self):
        text = self.RISKY_WORKFLOW.replace(
            "  workflow_run:\n    workflows: [build]\n    types: [completed]\n", "  pull_request:\n"
        )
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_benign_run_step_after_download_is_not_flagged(self):
        text = self.RISKY_WORKFLOW.replace(
            "        run: |\n          chmod +x ./test-results/run.sh\n          ./test-results/run.sh\n",
            '        run: echo "done"\n',
        )
        self.assertEqual(check.scan_text(text), [])

    def test_run_step_before_download_is_not_attributed(self):
        text = """\
on:
  workflow_run:
jobs:
  handle:
    steps:
      - run: ./preexisting.sh
      - uses: actions/download-artifact@v4
"""
        findings = check.scan_text(text)
        self.assertEqual([f["type"] for f in findings], [check.UNSCOPED_ARTIFACT_DOWNLOAD])

    def test_exec_in_a_different_job_is_not_attributed(self):
        text = """\
on:
  workflow_run:
jobs:
  a:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: x
  b:
    steps:
      - run: ./something.sh
"""
        findings = check.scan_text(text)
        self.assertEqual(findings, [])

    def test_single_line_run_step_is_recognised(self):
        text = """\
on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: x
      - run: ./x/run.sh
"""
        findings = check.scan_text(text)
        self.assertEqual([f["type"] for f in findings], [check.ARTIFACT_EXECUTED])


class ScanTextUnscopedDownload(unittest.TestCase):
    def test_download_with_no_name_is_flagged(self):
        text = """\
on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
      - run: echo done
"""
        findings = check.scan_text(text)
        unscoped = [f for f in findings if f["type"] == check.UNSCOPED_ARTIFACT_DOWNLOAD]
        self.assertEqual(len(unscoped), 1)
        self.assertEqual(unscoped[0]["line"], 6)

    def test_download_with_name_is_not_flagged(self):
        text = """\
on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
      - run: echo done
"""
        self.assertEqual(check.scan_text(text), [])

    def test_unscoped_download_on_a_trusted_trigger_is_not_flagged(self):
        text = """\
on: push
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
"""
        self.assertEqual(check.scan_text(text), [])


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
                "on:\n  workflow_run:\njobs:\n  h:\n    steps:\n"
                "      - uses: actions/download-artifact@v4\n"
                "      - run: ./x.sh\n",
            )
            self.assertEqual(check.main([tmp]), 0)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on:\n  workflow_run:\njobs:\n  h:\n    steps:\n"
                "      - uses: actions/download-artifact@v4\n"
                "      - run: ./x.sh\n",
            )
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 2)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on:\n  workflow_run:\njobs:\n  h:\n    steps:\n"
                "      - uses: actions/download-artifact@v4\n"
                "        with:\n"
                "          name: x\n"
                "      - run: ./x.sh\n",
            )
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], "artifact-executed-after-untrusted-download")

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.main([tmp]), 0)


if __name__ == "__main__":
    unittest.main()
