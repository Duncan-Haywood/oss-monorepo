import json
import tempfile
import unittest
from pathlib import Path

import audit

BAD = """on:
  pull_request_target:
permissions: write-all
jobs:
  b:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: echo "${{ github.event.pull_request.title }}"
"""

GOOD = """on: push
permissions:
  contents: read
jobs:
  b:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5
        with:
          persist-credentials: false
      - run: echo hi
"""


def repo(text):
    d = tempfile.TemporaryDirectory()
    wf = Path(d.name) / ".github" / "workflows"
    wf.mkdir(parents=True)
    (wf / "ci.yml").write_text(text)
    return d


class AuditTests(unittest.TestCase):
    def test_all_checkers_are_vendored(self):
        for name, _, _ in audit.CHECKS:
            self.assertTrue((audit.CHECKS_DIR / f"{name}.py").exists(), name)

    def test_bad_workflow_has_high_findings_sorted_first(self):
        with repo(BAD) as d:
            findings, errors = audit.audit(d)
        self.assertEqual(errors, [])
        rules = {f["rule"] for f in findings}
        self.assertTrue({"pwn-request-checkout", "script-injection", "write-all"} <= rules)
        self.assertEqual(findings[0]["severity"], "high")
        ranks = [audit.RANK[f["severity"]] for f in findings]
        self.assertEqual(ranks, sorted(ranks, reverse=True))
        self.assertTrue(all(f["file"] == ".github/workflows/ci.yml" for f in findings))

    def test_clean_workflow_is_clean(self):
        with repo(GOOD) as d:
            findings, errors = audit.audit(d)
        self.assertEqual((findings, errors), ([], []))

    def test_unpinned_refs_are_graded_by_owner(self):
        wf = """on: push
permissions:
  contents: read
jobs:
  b:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: "tj-actions/changed-files@v45"
      - uses: ./local-action
      - uses: ok/pinned@0123456789abcdef0123456789abcdef01234567 # v1
      - uses: docker://alpine:3.20
      - uses: org/repo/.github/workflows/x.yml@main
"""
        with repo(wf) as d:
            findings, errors = audit.audit(d)
        self.assertEqual(errors, [])
        got = sorted((f["rule"], f["line"]) for f in findings)
        self.assertEqual(got, [
            ("unpinned-docker-action", 15),
            ("unpinned-first-party-action", 9),
            ("unpinned-third-party-action", 12),
            ("unpinned-third-party-action", 16),
        ])
        sev = {f["rule"]: f["severity"] for f in findings}
        self.assertEqual(sev["unpinned-third-party-action"], "medium")
        self.assertEqual(sev["unpinned-first-party-action"], "low")

    def test_no_workflows_dir_is_clean(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(audit.audit(d), ([], []))

    def test_fail_on_threshold(self):
        with repo(BAD) as d:
            findings, _ = audit.audit(d)
        self.assertTrue(audit.should_fail(findings, "high"))
        self.assertTrue(audit.should_fail(findings, "low"))
        self.assertFalse(audit.should_fail(findings, "none"))
        low_only = [f for f in findings if f["severity"] == "low"]
        self.assertFalse(audit.should_fail(low_only, "medium"))

    def test_cli_exit_codes_and_formats(self):
        with repo(BAD) as d:
            self.assertEqual(audit.main([d, "--format", "json"]), 0)
            self.assertEqual(audit.main([d, "--fail-on", "high", "--output", str(Path(d) / "o.txt")]), 2)
            sarif = json.loads(audit.render_sarif(audit.audit(d)[0]))
        self.assertEqual(sarif["version"], "2.1.0")
        res = sarif["runs"][0]["results"]
        self.assertTrue(res and all(r["locations"][0]["physicalLocation"]["region"]["startLine"] >= 1 for r in res))
        self.assertEqual(audit.main(["/nonexistent-dir-xyz"]), 1)

    def test_deploy_without_concurrency_is_flagged(self):
        d = repo("on: push\npermissions:\n  contents: read\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo ship\n")
        findings, errors = audit.audit(Path(d.name))
        self.assertEqual(errors, [])
        hits = [f for f in findings if f["check"] == "deploy-concurrency"]
        self.assertEqual([h["rule"] for h in hits], ["no-concurrency"])
        self.assertEqual(hits[0]["scope"], "deploy")
        self.assertTrue(hits[0]["fix"])

    def test_markdown_escapes_pipes_and_carries_disclaimer(self):
        md = audit.render_markdown([{"severity": "low", "file": "a", "line": 1, "rule": "r",
                                     "detail": "x|y", "fix": "z", "check": "c", "scope": None}], [])
        self.assertIn("x\\|y", md)
        self.assertIn("not a security audit", md)

    def test_vendored_copies_match_source_ventures(self):
        # Drift guard: the action must not silently diverge from the venture it vendors.
        root = Path(__file__).resolve().parent.parent
        for name, _, _ in audit.CHECKS:
            src = root / ("deploy-concurrency-check" if name == "deploy-concurrency" else f"actions-{name}-check") / "check.py"
            if src.exists():
                self.assertEqual(src.read_text(), (audit.CHECKS_DIR / f"{name}.py").read_text(), name)


if __name__ == "__main__":
    unittest.main()
