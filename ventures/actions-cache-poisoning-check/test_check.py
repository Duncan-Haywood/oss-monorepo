import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


class ScanTextCacheWrite(unittest.TestCase):
    UNTRUSTED_WORKFLOW = """\
name: pr
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.pnpm-store
          key: pnpm-${{ github.event.pull_request.head.sha }}
      - run: pnpm install
"""

    def test_flags_unified_cache_action_under_pull_request_target(self):
        findings = check.scan_text(self.UNTRUSTED_WORKFLOW)
        writes = [f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["line"], 9)
        self.assertEqual(writes[0]["detail"], "actions/cache")

    def test_workflow_run_trigger_also_flags(self):
        text = self.UNTRUSTED_WORKFLOW.replace("pull_request_target:", "workflow_run:\n    workflows: [ci]")
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER]), 1)

    def test_same_cache_step_under_plain_pull_request_is_not_flagged(self):
        text = self.UNTRUSTED_WORKFLOW.replace("pull_request_target:", "pull_request:")
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER], [])

    def test_explicit_cache_save_is_flagged(self):
        text = self.UNTRUSTED_WORKFLOW.replace("uses: actions/cache@v4", "uses: actions/cache/save@v4")
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER]), 1)

    def test_read_only_cache_restore_is_not_a_write_finding(self):
        text = self.UNTRUSTED_WORKFLOW.replace("uses: actions/cache@v4", "uses: actions/cache/restore@v4")
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER], [])

    def test_cache_step_on_trusted_trigger_is_not_flagged(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER], [])

    def test_unrelated_later_step_is_not_attributed_to_cache(self):
        text = """\
on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: some/other-action@v1
        with:
          key: ${{ github.event.pull_request.head.sha }}
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.CACHE_WRITE_ON_UNTRUSTED_TRIGGER], [])


class ScanTextRestoreKeys(unittest.TestCase):
    def test_restore_keys_on_unified_cache_is_flagged_regardless_of_trigger(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-
"""
        findings = check.scan_text(text)
        restores = [f for f in findings if f["type"] == check.UNSCOPED_RESTORE_KEYS]
        self.assertEqual(len(restores), 1)
        self.assertEqual(restores[0]["line"], 8)

    def test_restore_keys_on_explicit_restore_action_is_flagged(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache/restore@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-
"""
        findings = check.scan_text(text)
        self.assertEqual(len([f for f in findings if f["type"] == check.UNSCOPED_RESTORE_KEYS]), 1)

    def test_restore_keys_field_on_a_save_only_step_is_not_flagged(self):
        # actions/cache/save has no restore-keys input in practice, but if a
        # workflow author pastes one in anyway there is nothing for it to
        # affect on the write-only action -- keep the false-positive rate low.
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache/save@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.UNSCOPED_RESTORE_KEYS], [])

    def test_cache_step_without_restore_keys_is_not_flagged(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
"""
        self.assertEqual(check.scan_text(text), [])

    def test_restore_keys_belonging_to_a_later_unrelated_step_is_not_attributed(self):
        text = """\
on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}
      - uses: some/other-action@v1
        with:
          restore-keys: unrelated
"""
        findings = check.scan_text(text)
        self.assertEqual([f for f in findings if f["type"] == check.UNSCOPED_RESTORE_KEYS], [])


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
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/cache@v4\n        with:\n"
                "          key: k-${{ github.event.pull_request.head.sha }}\n"
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
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/cache@v4\n        with:\n"
                "          key: k-${{ github.event.pull_request.head.sha }}\n",
            )
            self.assertEqual(check.main([tmp]), 0)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/cache@v4\n        with:\n"
                "          key: k-${{ github.event.pull_request.head.sha }}\n",
            )
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 2)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_repo(
                tmp,
                "on: pull_request_target\njobs:\n  b:\n    steps:\n"
                "      - uses: actions/cache@v4\n        with:\n"
                "          key: k-${{ github.event.pull_request.head.sha }}\n",
            )
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], "cache-write-on-untrusted-trigger")

    def test_no_workflows_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.main([tmp]), 0)


if __name__ == "__main__":
    unittest.main()
