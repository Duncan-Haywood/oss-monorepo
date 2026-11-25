#!/usr/bin/env python3
"""Tests for the scanner runner. The parsers read trimmed real outputs of the
pinned tools (fixtures/outputs/, captured 2026-11-24 from the first
full-repository scan, secrets redacted by gitleaks itself); the rest checks
what decides a verdict: new-versus-base counting, the baseline, block
thresholds, staging that never copies planted scanner configs, and that a
tool failing never reads as a clean scan.

    python3 -m unittest discover -s platform/security -p 'test_*.py'
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("security_scan_under_test", HERE / "scan.py")
scan = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = scan
_spec.loader.exec_module(scan)

OUT = HERE / "fixtures" / "outputs"
ROOT = Path("/scan-root")


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def F(tool="semgrep", rule="r", sev="high", path="a.py", h="x"):
    return scan.Finding(tool, rule, sev, path, 1, "m", h)


class Parsers(unittest.TestCase):
    def test_gitleaks_is_critical_and_redacted(self):
        got = scan.parse_gitleaks(load("gitleaks.json"), ROOT)
        self.assertEqual(len(got), 2)
        self.assertTrue(all(f.severity == "critical" for f in got))
        self.assertTrue(all(f.path.startswith("ventures/terraform-plan-secret-exposure-check/") for f in got))
        self.assertNotIn("AKIA", json.dumps([f.__dict__ for f in got]))

    def test_zizmor_uses_the_primary_location(self):
        got = {f.rule: f for f in scan.parse_zizmor(load("zizmor.json"), ROOT)}
        self.assertEqual(got["github-app"].severity, "high")
        self.assertRegex(got["github-app"].path, r"\.github/workflows/priv-[\w-]+\.yml$")
        self.assertIsInstance(got["github-app"].line, int)
        self.assertEqual(got["adhoc-packages"].severity, "low")

    def test_zizmor_low_confidence_high_is_not_blocking(self):
        data = load("zizmor.json")
        data[0]["determinations"] = {"severity": "High", "confidence": "Low"}
        self.assertEqual(scan.parse_zizmor(data, ROOT)[0].severity, "medium")

    def test_trivy(self):
        got = scan.parse_trivy(load("trivy.json"), ROOT)
        self.assertEqual(len(got), 3)
        self.assertTrue(all(f.rule.startswith(("DS-", "AWS-", "AVD-")) for f in got), [f.rule for f in got])
        self.assertTrue(all(f.severity in scan.SEV_RANK for f in got))

    def test_checkov_severity_from_curated_list(self):
        data = load("checkov.json")
        ids = [c["check_id"] for c in data[0]["results"]["failed_checks"]]
        got = scan.parse_checkov(data, ROOT, {ids[0]})
        self.assertEqual([f.severity for f in got], ["high", "medium"])
        self.assertEqual(got[0].path, "platform/counter/deploy/Dockerfile")

    def test_osv_cvss_to_severity(self):
        got = scan.parse_osv(load("osv.json"), ROOT)
        self.assertEqual(got[0].rule, "GHSA-2v37-7h3g-55p8")
        self.assertEqual(got[0].severity, "high")  # max_severity 8.2

    def test_osv_malicious_package_is_critical(self):
        self.assertEqual(scan._osv_severity({"max_severity": ""}, ["MAL-2026-1"]), "critical")
        self.assertEqual(scan._osv_severity({"max_severity": ""}, ["GHSA-x"]), "medium")
        self.assertEqual(scan._osv_severity({"max_severity": "9.8"}, ["GHSA-x"]), "critical")

    def test_semgrep_local_rule_ids_lose_their_prefix(self):
        data = {"results": [{"check_id": "platform.security.semgrep.py-eval-exec-dynamic", "path": "a.py",
                             "start": {"line": 3}, "extra": {"severity": "ERROR", "message": "m"}}]}
        got = scan.parse_semgrep(data, ROOT)
        self.assertEqual((got[0].rule, got[0].severity), ("py-eval-exec-dynamic", "high"))
        self.assertEqual(scan.parse_semgrep(data, ROOT, tool="semgrep-registry")[0].rule, data["results"][0]["check_id"])

    def test_liability_audit(self):
        data = {"findings": [{"id": "advice-without-disclaimer", "severity": "high", "title": "t",
                              "evidence": [{"file": "index.html", "line": 4, "match": "tax advice"}]}]}
        got = scan.parse_liability(data, ROOT, "ventures/x")
        self.assertEqual((got[0].path, got[0].severity), ("ventures/x/index.html", "high"))


class Verdicts(unittest.TestCase):
    def test_only_findings_beyond_the_base_are_new(self):
        base = [F(h="a"), F(h="b")]
        head = [F(h="a"), F(h="b"), F(h="b"), F(h="c")]
        self.assertEqual([f.snippet_hash for f in scan.new_findings(base, head)], ["b", "c"])

    def test_threshold_and_baseline(self):
        tools = {"semgrep": {"block_at": "high"}, "trivy-config": {"block_at": "critical"}}
        baseline = [{"tool": "semgrep", "rule": "ok-rule", "path": "a.py", "reason": "constant input only"}]
        findings = [F(rule="bad"), F(rule="ok-rule"), F(sev="medium"), F(tool="trivy-config", sev="high"), F(tool="trivy-config", sev="critical")]
        blocking, reported = scan.verdict(findings, tools, baseline)
        self.assertEqual([(f.tool, f.rule, f.severity) for f in blocking], [("semgrep", "bad", "high"), ("trivy-config", "r", "critical")])
        self.assertEqual([f.accepted for f in reported if f.rule == "ok-rule"], ["constant input only"])

    def test_baseline_fingerprint_must_match_when_given(self):
        e = [{"tool": "semgrep", "rule": "r", "path": "*.py", "fingerprint": "zzz", "reason": "x"}]
        self.assertIsNone(scan.accepted_by(F(h="x"), e))
        self.assertEqual(scan.accepted_by(F(h="zzz"), e), "x")

    def test_missing_required_tool_fails(self):
        tools = {"gitleaks": {"required": True}, "osv-scanner": {"required": False}}
        status = {"gitleaks": "MISSING: not installed", "osv-scanner": "ERROR: network"}
        self.assertEqual(scan.failed_required(status, tools), ["gitleaks"])

    def test_repo_files_load(self):
        tools = scan.load_tools()
        self.assertEqual(set(tools) >= {"gitleaks", "semgrep", "osv-scanner", "checkov", "trivy-config", "zizmor", "liability-audit"}, True)
        for name, spec in tools.items():
            if spec["kind"] == "pip":
                self.assertTrue((HERE / spec["lock"]).is_file(), name)
                self.assertIn("--hash=sha256:", (HERE / spec["lock"]).read_text())
            if spec["kind"] == "go":
                self.assertRegex(spec["go_sum"], r"^h1:[A-Za-z0-9+/]{43}=$")
                self.assertRegex(spec["version"], r"^v\d+\.\d+\.\d+$")
        self.assertEqual(scan.load_baseline(), [])


class Staging(unittest.TestCase):
    def test_planted_configs_symlinks_and_fixtures_are_not_staged(self):
        with tempfile.TemporaryDirectory() as t:
            tree, dest = Path(t, "tree"), Path(t, "dest")
            (tree / "app").mkdir(parents=True)
            (tree / "app" / "a.py").write_text("x\n")
            (tree / "app" / ".gitleaks.toml").write_text("[allowlist]\n")
            (tree / "app" / "fixtures").mkdir()
            (tree / "app" / "fixtures" / "bad.py").write_text("x\n")
            (tree / "app" / "link.py").symlink_to("/etc/hostname")
            got = scan.stage(tree, ["app/a.py", "app/.gitleaks.toml", "app/fixtures/bad.py", "app/link.py"], dest)
            self.assertEqual(got, ["app/a.py"])
            self.assertEqual(sorted(p.name for p in dest.rglob("*") if p.is_file()), ["a.py"])

    def test_whole_dirs_for_iac(self):
        with tempfile.TemporaryDirectory() as t:
            tree = Path(t, "tree")
            (tree / "infra").mkdir(parents=True)
            for n in ("main.tf", "variables.tf"):
                (tree / "infra" / n).write_text("x\n")
            got = scan.stage(tree, ["infra/main.tf"], Path(t, "d"), whole_dirs=True)
            self.assertEqual(got, ["infra/main.tf", "infra/variables.tf"])

    def test_selected_honours_globs_and_excludes(self):
        self.assertEqual(scan.selected(["a/x.py", "a/x.md", "a/fixtures/y.py"], ["*.py"]), ["a/x.py"])


class ToolFailureIsNotClean(unittest.TestCase):
    def test_empty_output_is_an_error(self):
        proc = subprocess.CompletedProcess(["x"], 1, stdout="", stderr="boom")
        with self.assertRaises(RuntimeError):
            scan._json_out(proc)

    def test_pr_scan_reports_crash(self):
        with tempfile.TemporaryDirectory() as t:
            for side in ("b", "h"):
                Path(t, side).mkdir()
                Path(t, side, "a.py").write_text("x\n")
            tools = {"semgrep": {"kind": "pip", "lock": "locks/semgrep.txt", "binary": "semgrep", "paths": ["*.py"], "required": True}}
            with mock.patch.object(scan, "scan_tool", side_effect=RuntimeError("exit 2")):
                res = scan.scan_pr(Path(t, "b"), Path(t, "h"), ["a.py"], tools, Path(t, "tools"))
            self.assertTrue(res["status"]["semgrep"].startswith("ERROR"))
            self.assertEqual(scan.failed_required(res["status"], tools), ["semgrep"])

    def test_missing_tool_reported(self):
        with self.assertRaises(scan.ToolMissing):
            scan.tool_bin("gitleaks", {"kind": "go", "binary": "gitleaks"}, Path("/nonexistent"))


class Applicable(unittest.TestCase):
    def test_a_docs_pr_needs_only_gitleaks(self):
        tools = scan.load_tools()
        self.assertEqual(scan.applicable(tools, ["docs/posts/a.md"]), {"gitleaks"})
        self.assertIn("zizmor", scan.applicable(tools, [".github/workflows/x.yml"]))
        self.assertIn("checkov", scan.applicable(tools, ["platform/aws/stacks/x/main.tf"]))
        self.assertIn("liability-audit", scan.applicable(tools, ["ventures/x/index.html"]))


if __name__ == "__main__":
    unittest.main()


class ConcatenatedJson(unittest.TestCase):
    def test_one_document_unchanged(self):
        self.assertEqual(scan._loads_concatenated('{"a": 1}'), {"a": 1})
        self.assertEqual(scan._loads_concatenated('[{"a": 1}, {"b": 2}]'), [{"a": 1}, {"b": 2}])

    def test_back_to_back_documents_become_a_list(self):
        text = '{"check_type": "terraform", "results": {}}\n{"check_type": "dockerfile", "results": {}}\n'
        docs = scan._loads_concatenated(text)
        self.assertEqual([d["check_type"] for d in docs], ["terraform", "dockerfile"])

    def test_garbage_still_raises(self):
        with self.assertRaises(ValueError):
            scan._loads_concatenated('{"a": 1} not-json')
