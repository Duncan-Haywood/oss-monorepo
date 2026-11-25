"""Tests for platform/security/scan (scan.py and install.py).

Parsers are tested on output captured from the pinned scanners themselves
(trimmed); the runner is faked so no scanner is needed, except SemgrepRulesTest,
which runs the real rules when install.py has put semgrep in place.

    python3 -m unittest platform/security/scan/test_scan.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import install  # noqa: E402
import scan  # noqa: E402
from scan import Finding  # noqa: E402


class RouteTest(unittest.TestCase):
    def route(self, paths, heads=None):
        return scan.route(paths, read=lambda p: (heads or {}).get(p, ""))

    def test_each_kind_of_path_reaches_its_scanners(self):
        r = self.route([
            "ventures/a/app.py", "ventures/a/web/x.mjs", "ventures/a/package-lock.json",
            "ventures/a/requirements-dev.txt", "platform/security/scan/requirements/semgrep.txt",
            ".github/workflows/ci.yml", ".github/actions/setup/action.yml",
            "platform/aws/site/main.tf", "platform/aws/modules/bucket/variables.tf",
            "ventures/b/Dockerfile", "ventures/b/docker-compose.yml", "README.md",
        ])
        self.assertEqual(r["semgrep"], ["ventures/a/app.py", "ventures/a/web/x.mjs"])
        self.assertEqual(r["osv-scanner"], ["platform/security/scan/requirements/semgrep.txt",
                                            "ventures/a/package-lock.json", "ventures/a/requirements-dev.txt"])
        self.assertEqual(r["zizmor"], [".github/actions/setup/action.yml", ".github/workflows/ci.yml"])
        self.assertEqual(r["tofu"], ["platform/aws/modules/bucket", "platform/aws/site"])
        self.assertIn("platform/aws/site/", r["checkov"])
        self.assertIn("ventures/b/Dockerfile", r["trivy-config"])
        self.assertEqual(r["trivy-image"], ["ventures/b/Dockerfile", "ventures/b/docker-compose.yml"])
        self.assertNotIn("README.md", sum(r.values(), []))

    def test_vendored_and_testdata_paths_are_skipped(self):
        r = self.route(["web/node_modules/x/index.js", "platform/deploy/vendor/y.py",
                        "platform/security/scan/testdata/bad.py"])
        self.assertEqual(sum(r.values(), []), [])

    def test_manifests_are_recognised_by_content(self):
        heads = {"k8s/dep.yaml": "apiVersion: apps/v1\nkind: Deployment\n",
                 "cfn/stack.yaml": "AWSTemplateFormatVersion: '2010-09-09'\n",
                 "conf/settings.yaml": "name: x\n"}
        r = self.route(list(heads), heads)
        self.assertEqual(r["checkov"], ["cfn/stack.yaml", "k8s/dep.yaml"])

    def test_workflows_are_not_treated_as_manifests(self):
        r = self.route([".github/workflows/x.yml"], {".github/workflows/x.yml": "apiVersion: v1\nkind: X\n"})
        self.assertEqual(r["checkov"], [])


class SeverityAndFingerprintTest(unittest.TestCase):
    def test_severity_words_normalise(self):
        self.assertEqual([scan.norm_severity(s) for s in ["ERROR", "WARNING", "INFO", "Informational", "HIGH", "Low"]],
                         ["high", "medium", "info", "info", "high", "low"])

    def test_cvss_bands_and_unscored_is_medium(self):
        self.assertEqual([scan.cvss_label(s) for s in ["9.8", 7.5, "4.0", "2", None, ""]],
                         ["critical", "high", "medium", "low", "medium", "medium"])

    def test_fingerprint_ignores_whitespace_but_not_path(self):
        a = scan.fingerprint("semgrep", "r", "a.py", "x =  1")
        self.assertEqual(a, scan.fingerprint("semgrep", "r", "a.py", " x = 1 "))
        self.assertNotEqual(a, scan.fingerprint("semgrep", "r", "b.py", "x = 1"))


class BaselineTest(unittest.TestCase):
    def f(self, **kw):
        base = dict(tool="osv-scanner", rule="GHSA-1", severity="high", path="a/requirements.txt", line=0,
                    message="m", fingerprint="fp1")
        base.update(kw)
        return Finding(**base)

    def test_every_entry_needs_a_reason(self):
        problems = scan.baseline_problems({"accepted": [{"tool": "semgrep", "rule": "r", "reason": " "}],
                                           "exclude_paths": [{"glob": "x/**"}]})
        self.assertEqual(len(problems), 2)

    def test_secrets_only_by_fingerprint_and_no_wildcard_tool(self):
        problems = scan.baseline_problems({"accepted": [
            {"tool": "gitleaks", "rule": "aws-access-token", "reason": "test key"},
            {"tool": "*", "rule": "x", "reason": "everything"}]})
        self.assertTrue(any("fingerprint only" in p for p in problems))
        self.assertTrue(any("wildcard tool" in p for p in problems))

    def test_matching_by_rule_and_glob_and_by_fingerprint(self):
        entries = [{"tool": "osv-scanner", "rule": "GHSA-1", "path": "a/*.txt", "reason": "r1"},
                   {"fingerprint": "fp9", "reason": "r2"}]
        found = [self.f(), self.f(path="b/requirements.txt"), self.f(rule="GHSA-2", fingerprint="fp9")]
        scan.apply_baseline(found, {"accepted": entries})
        self.assertEqual([x.baselined for x in found], [True, False, True])
        self.assertEqual(found[0].baseline_reason, "r1")

    def test_the_committed_baseline_is_valid(self):
        data = scan.load_baseline(HERE / "baseline.json")
        self.assertEqual(scan.baseline_problems(data), [])


class ParserTest(unittest.TestCase):
    """Shapes captured from the pinned versions (tools.json), trimmed to the fields used."""

    def test_gitleaks_never_keeps_the_secret_but_tells_secrets_apart(self):
        secret = "AKIAZZZZTESTONLYVALUE"
        data = [{"RuleID": "aws-access-token", "Description": "AWS key", "File": "/repo/a/b.env", "StartLine": 3,
                 "Secret": secret, "Match": f"key={secret}", "Commit": "abc123def4567890"},
                {"RuleID": "aws-access-token", "Description": "AWS key", "File": "/repo/a/b.env", "StartLine": 9,
                 "Secret": secret + "2", "Match": "x", "Commit": "abc123def4567890"}]
        f, g = scan.parse_gitleaks(data, Path("/repo"))
        self.assertEqual((f.path, f.line, f.severity), ("a/b.env", 3, "critical"))
        self.assertNotIn(secret, json.dumps(f.__dict__))
        self.assertNotIn("ZZZZ", json.dumps(f.__dict__))
        self.assertIn("abc123def456", f.message)
        self.assertNotEqual(f.fingerprint, g.fingerprint)  # one accepted fixture must not cover a new secret

    def test_semgrep(self):
        data = {"results": [{"check_id": "tmp.rules.py-yaml-unsafe-load", "path": "x/a.py", "start": {"line": 5},
                             "extra": {"severity": "ERROR", "message": "yaml.load  without\nSafeLoader"}}]}
        [f] = scan.parse_semgrep(data, Path("/nonexistent"))
        self.assertEqual((f.rule, f.severity, f.line, f.message), ("py-yaml-unsafe-load", "high", 5,
                                                                    "yaml.load without SafeLoader"))

    def test_osv_groups_prefer_ghsa_and_carry_fix(self):
        data = {"results": [{"source": {"path": "/r/req.txt", "type": "lockfile"}, "packages": [{
            "package": {"name": "mcp", "version": "1.29.0", "ecosystem": "PyPI"},
            "vulnerabilities": [{"id": "GHSA-84m7-p3x7-pcfv", "summary": "Unbounded sessions",
                                 "affected": [{"ranges": [{"events": [{"introduced": "0"}, {"fixed": "1.30.0"}]}]}]},
                                {"id": "PYSEC-1", "summary": "same"}],
            "groups": [{"ids": ["PYSEC-1", "GHSA-84m7-p3x7-pcfv"], "max_severity": "7.5"}]}]}]}
        [f] = scan.parse_osv(data, Path("/r"))
        self.assertEqual((f.rule, f.severity, f.path), ("GHSA-84m7-p3x7-pcfv", "high", "req.txt"))
        self.assertIn("fixed in 1.30.0", f.message)

    def test_checkov_uses_repo_path_and_policy_severity(self):
        data = [{"check_type": "terraform", "results": {"failed_checks": [
            {"check_id": "CKV_AWS_20", "check_name": "public READ", "repo_file_path": "/platform/aws/x/main.tf",
             "file_path": "/main.tf", "file_line_range": [1, 4], "resource": "aws_s3_bucket.b", "severity": None},
            {"check_id": "CKV_AWS_18", "check_name": "access logging", "repo_file_path": "/platform/aws/x/main.tf",
             "file_line_range": [1, 4], "resource": "aws_s3_bucket.b", "severity": None}]}},
            {"check_type": "dockerfile", "results": {"failed_checks": []}}]
        fs = scan.parse_checkov(data, {"checkov_high": ["CKV_AWS_20"]})
        self.assertEqual([(f.rule, f.severity, f.path, f.line) for f in fs],
                         [("CKV_AWS_20", "high", "platform/aws/x/main.tf", 1),
                          ("CKV_AWS_18", "medium", "platform/aws/x/main.tf", 1)])

    def test_checkov_back_to_back_documents(self):
        doc = {"check_type": "dockerfile", "results": {"failed_checks": [
            {"check_id": "CKV_DOCKER_8", "repo_file_path": "/a/Dockerfile", "file_line_range": [1, 1], "resource": "r"}]}}
        text = json.dumps(doc, indent=2) + "\n" + json.dumps(doc) + "\n"
        self.assertEqual(len(scan.json_documents(text)), 2)

    def test_trivy_config_paths_for_dir_and_file_targets(self):
        data = {"Results": [{"Target": "main.tf", "Misconfigurations": [
            {"ID": "AWS-0086", "Severity": "HIGH", "Status": "FAIL", "Title": "block public ACL", "Message": "m",
             "CauseMetadata": {"Resource": "aws_s3_bucket.b", "StartLine": 1}},
            {"ID": "AWS-0089", "Severity": "LOW", "Status": "PASS", "Title": "ok"}]}]}
        [f] = scan.parse_trivy_config(data, "platform/aws/x/")
        self.assertEqual((f.path, f.severity, f.rule), ("platform/aws/x/main.tf", "high", "AWS-0086"))
        [g] = scan.parse_trivy_config({"Results": [{"Target": "Dockerfile", "Misconfigurations": [
            {"ID": "DS-0002", "Severity": "HIGH", "Status": "FAIL", "Title": "root user"}]}]}, "ventures/b/Dockerfile")
        self.assertEqual(g.path, "ventures/b/Dockerfile")

    def test_trivy_image(self):
        data = {"Results": [{"Vulnerabilities": [{"VulnerabilityID": "CVE-2026-1", "PkgName": "openssl",
                                                  "InstalledVersion": "3.0.1", "FixedVersion": "3.0.9",
                                                  "Severity": "CRITICAL", "Title": "t"}]}]}
        [f] = scan.parse_trivy_image(data, "python:3.12-slim", "ventures/b/Dockerfile")
        self.assertEqual((f.severity, f.path), ("critical", "ventures/b/Dockerfile"))
        self.assertIn("python:3.12-slim: openssl@3.0.1", f.message)

    def test_zizmor_reads_primary_location_and_skips_ignored(self):
        data = [{"ident": "artipacked", "desc": "credential persistence", "url": "u",
                 "determinations": {"confidence": "Low", "severity": "Medium"},
                 "locations": [{"symbolic": {"key": {"Local": {"verbatim_path": ".github/workflows/ci.yml"}},
                                             "annotation": "does not set persist-credentials: false", "kind": "Primary"},
                                "concrete": {"location": {"start_point": {"row": 5}}, "feature": "uses: x"}}],
                 "ignored": False},
                {"ident": "x", "ignored": True, "locations": []}]
        [f] = scan.parse_zizmor(data)
        self.assertEqual((f.rule, f.severity, f.path, f.line), ("artipacked", "medium", ".github/workflows/ci.yml", 6))

    def test_tofu_validate(self):
        data = {"valid": False, "diagnostics": [{"severity": "error", "summary": "Unsupported argument",
                                                 "detail": "x", "range": {"filename": "main.tf", "start": {"line": 3}}}]}
        [f] = scan.parse_tofu_validate(data, "platform/aws/site")
        self.assertEqual((f.path, f.line, f.severity), ("platform/aws/site/main.tf", 3, "high"))


class ImageTest(unittest.TestCase):
    def test_dockerfile_refs_skip_stages_scratch_and_vars(self):
        text = ("ARG BASE=python\nFROM --platform=linux/amd64 node:22@sha256:abc AS build\nFROM build AS test\n"
                "FROM ${BASE}:3.12\nFROM scratch\nfrom python:3.12-slim\n")
        refs = scan.image_refs("Dockerfile", text)
        self.assertEqual(refs, ["node:22@sha256:abc", "python:3.12-slim"])
        self.assertEqual([f.message.split()[0] for f in scan.unpinned_findings("Dockerfile", refs)], ["python:3.12-slim"])

    def test_compose_refs(self):
        text = "services:\n  db:\n    image: postgres:16\n  app:\n    image: \"${APP_IMAGE}\"\n"
        self.assertEqual(scan.image_refs("docker-compose.yml", text), ["postgres:16"])


class FakeRunner:
    def __init__(self, replies):
        self.replies, self.calls = replies, []

    def __call__(self, cmd, cwd=None, env=None, timeout=None):
        self.calls.append(cmd)
        for key, reply in self.replies.items():
            if key in " ".join(map(str, cmd)):
                return reply(cmd) if callable(reply) else reply
        return 0, "", ""


class ScannerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        for name in ("semgrep", "zizmor", "osv-scanner", "gitleaks", "trivy", "checkov", "tofu"):
            (self.bin / name).write_text("")
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_a_scanner_that_cannot_run_fails_closed(self):
        runner = FakeRunner({"zizmor --format": (2, "", "boom")})
        r = scan.Scanner(self.bin, runner, tmp=self.tmp).run_tool("zizmor", [".github/workflows/a.yml"])
        self.assertEqual(r.status, "error")
        self.assertIn("boom", r.error)
        s = scan.summarise({"zizmor": r}, "high", allow_missing=False)
        self.assertFalse(s["passed"])
        self.assertEqual(s["tools_failed"], ["zizmor"])

    def test_non_json_output_is_an_error_not_an_empty_pass(self):
        runner = FakeRunner({"zizmor --format": (0, "not json", "")})
        r = scan.Scanner(self.bin, runner, tmp=self.tmp).run_tool("zizmor", ["a.yml"])
        self.assertEqual(r.status, "error")

    def test_missing_scanner_fails_unless_allowed(self):
        (self.bin / "zizmor").unlink()
        sc = scan.Scanner(self.bin, FakeRunner({}), tmp=self.tmp)
        sc.exe = lambda name: None
        r = sc.run_tool("zizmor", ["a.yml"])
        self.assertEqual(r.status, "missing")
        self.assertFalse(scan.summarise({"zizmor": r}, "high", False)["passed"])
        self.assertTrue(scan.summarise({"zizmor": r}, "high", True)["passed"])

    def test_no_targets_is_skipped_and_passes(self):
        r = scan.Scanner(self.bin, FakeRunner({}), tmp=self.tmp).run_tool("checkov", [])
        self.assertEqual(r.status, "skipped")
        self.assertTrue(scan.summarise({"checkov": r}, "high", False)["passed"])

    def test_fail_on_threshold_and_baselined_findings(self):
        r = scan.ToolRun(status="ok", targets=1, findings=[
            Finding("semgrep", "a", "medium", "x.py", 1, "m"),
            Finding("semgrep", "b", "high", "x.py", 2, "m", baselined=True, baseline_reason="ok")])
        self.assertTrue(scan.summarise({"semgrep": r}, "high", False)["passed"])
        self.assertFalse(scan.summarise({"semgrep": r}, "medium", False)["passed"])
        self.assertEqual(scan.summarise({"semgrep": r}, "high", False)["baselined"], 1)

    def test_gitleaks_diff_mode_scans_the_commit_range(self):
        def reply(cmd):
            Path(cmd[cmd.index("--report-path") + 1]).write_text("[]")
            return 0, "", ""
        runner = FakeRunner({"gitleaks git": reply})
        r = scan.Scanner(self.bin, runner, base="abc", tmp=self.tmp).run_tool("gitleaks", ["abc..HEAD"])
        self.assertEqual(r.status, "ok")
        cmd = next(c for c in runner.calls if "git" in c)
        self.assertIn("abc..HEAD", cmd)
        report = Path(cmd[cmd.index("--report-path") + 1])
        self.assertFalse(report.exists())  # the unredacted report is deleted after parsing

    def test_osv_offline_flags_and_requirements_prefix(self):
        runner = FakeRunner({"scan source": (1, json.dumps({"results": []}), "")})
        sc = scan.Scanner(self.bin, runner, osv_offline=True, tmp=self.tmp)
        r = sc.run_tool("osv-scanner", ["x/requirements/dev.txt", "y/package-lock.json"])
        self.assertEqual(r.status, "ok")
        cmd = next(c for c in runner.calls if "scan" in c)
        self.assertIn("--offline-vulnerabilities", cmd)
        self.assertIn("requirements.txt:x/requirements/dev.txt", cmd)

    def test_one_unpullable_image_does_not_hide_the_others(self):
        (self.tmp / "Dockerfile").write_text("FROM demo/app:latest\nFROM python:3.12@sha256:abc\n")
        runner = FakeRunner({"demo/app": (1, "", "no such image"),
                             "python:3.12": (0, json.dumps({"Results": [{"Vulnerabilities": [
                                 {"VulnerabilityID": "CVE-1", "PkgName": "p", "InstalledVersion": "1",
                                  "FixedVersion": "2", "Severity": "HIGH"}]}]}), "")})
        r = scan.Scanner(self.bin, runner, root=self.tmp, tmp=self.tmp).run_tool("trivy-image", ["Dockerfile"])
        self.assertEqual(r.status, "ok")
        self.assertEqual(sorted(f.rule for f in r.findings), ["CVE-1", "image-not-pinned-by-digest", "image-not-scanned"])

    def test_tofu_init_failure_is_an_error(self):
        stack = self.tmp / "platform" / "aws" / "site"
        stack.mkdir(parents=True)
        (stack / "main.tf").write_text("")
        runner = FakeRunner({"init": (1, "", "registry unreachable")})
        r = scan.Scanner(self.bin, runner, root=self.tmp, tmp=self.tmp).run_tool("tofu", ["platform/aws/site"])
        self.assertEqual(r.status, "error")
        self.assertIn("registry unreachable", r.error)

    def test_tofu_runs_fmt_validate_and_test(self):
        stack = self.tmp / "platform" / "aws" / "site"
        (stack / "tests").mkdir(parents=True)
        (stack / "main.tf").write_text("")
        (stack / "tests" / "a.tftest.hcl").write_text("")
        runner = FakeRunner({"fmt": (3, "main.tf\n", ""), "validate": (0, json.dumps({"diagnostics": []}), ""),
                             " test": (1, "1 failed", "")})
        r = scan.Scanner(self.bin, runner, root=self.tmp, tmp=self.tmp).run_tool("tofu", ["platform/aws/site"])
        self.assertEqual(r.status, "ok")
        self.assertEqual(sorted(f.rule for f in r.findings), ["fmt", "test"])


class RenderTest(unittest.TestCase):
    def test_markdown_lists_new_findings_and_broken_scanners(self):
        doc = {"mode": "diff", "base": "abc", "paths": 3,
               "summary": {"passed": False, "fail_on": "high", "new_by_severity": {"high": 1},
                           "tools_failed": ["zizmor"]},
               "tools": {"zizmor": {"status": "error", "targets": 1, "new": 0, "baselined": 0, "seconds": 0.1,
                                    "error": "boom"},
                         "semgrep": {"status": "ok", "targets": 1, "new": 1, "baselined": 0, "seconds": 1}},
               "findings": [{"tool": "semgrep", "rule": "r|x", "severity": "high", "path": "a.py", "line": 2,
                             "message": "bad | thing", "baselined": False}]}
        md = scan.render_markdown(doc)
        self.assertIn("**Failed.**", md)
        self.assertIn("scanner `zizmor` could not run: boom", md)
        self.assertIn("`a.py:2`", md)
        self.assertIn("bad \\| thing", md)


class InstallTest(unittest.TestCase):
    def test_checksum_mismatch_refuses(self):
        with self.assertRaises(SystemExit):
            install.check_sum("t", "h1:aaa=", "h1:bbb=")
        with self.assertRaises(SystemExit):
            install.check_sum("t", "h1:aaa=", None)
        install.check_sum("t", "h1:aaa=", "h1:aaa=")

    def test_requirements_must_all_be_hashed(self):
        self.assertTrue(install.requirements_are_hashed("a==1 \\\n    --hash=sha256:00\nb==2 --hash=sha256:11\n"))
        self.assertFalse(install.requirements_are_hashed("a==1 --hash=sha256:00\nb==2\n"))
        self.assertFalse(install.requirements_are_hashed("# nothing\n"))

    def test_pins_change_with_version_sum_or_build_flags(self):
        spec = {"module": "m", "version": "v1", "sum": "h1:x=", "package": ".", "ldflags": ""}
        a = install.pin_of("go", spec)
        self.assertNotEqual(a, install.pin_of("go", dict(spec, ldflags="-X v=1")))
        self.assertNotEqual(a, install.pin_of("go", dict(spec, sum="h1:y=")))
        self.assertNotEqual(install.pin_of("py", {"version": "1"}, "a"), install.pin_of("py", {"version": "1"}, "b"))

    def test_committed_tools_are_pinned(self):
        tools = install.load_tools()
        for name, spec in tools["go"].items():
            self.assertRegex(spec["sum"], r"^h1:[A-Za-z0-9+/]{43}=$", name)
            self.assertRegex(spec["version"], r"^v\d+\.\d+\.\d+$", name)
        for name, spec in tools["python"].items():
            text = (HERE / spec["requirements"]).read_text()
            self.assertTrue(install.requirements_are_hashed(text), name)
            self.assertIn(f"{name}=={spec['version']}", text)
        self.assertEqual(set(tools["go"]) | {"semgrep", "checkov", "zizmor"},
                         {"gitleaks", "osv-scanner", "trivy", "tofu", "semgrep", "checkov", "zizmor"})


def _semgrep():
    p = install.tools_dir() / "bin" / "semgrep"
    return str(p) if p.exists() else shutil.which("semgrep")


@unittest.skipUnless(_semgrep(), "semgrep not installed (python3 platform/security/scan/install.py --only semgrep)")
class SemgrepRulesTest(unittest.TestCase):
    """Each local rule fires on its bad case and stays quiet on the safe one next to it."""

    CASES = {
        "a.py": ("import subprocess, os, yaml, requests, pickle, tempfile, jwt\n"
                 "subprocess.run(cmd, shell=True)\n"          # 2 bad
                 "subprocess.run('ls -l', shell=True)\n"      # 3 safe
                 "os.system('ls ' + x)\n"                     # 4 bad
                 "yaml.load(s)\n"                             # 5 bad
                 "yaml.load(s, Loader=yaml.SafeLoader)\n"     # 6 safe
                 "requests.get(u, verify=False)\n"            # 7 bad
                 "pickle.loads(b)\n"                          # 8 bad
                 "eval(x)\n"                                  # 9 bad
                 "tempfile.mktemp()\n"                        # 10 bad
                 "jwt.decode(t, options={'verify_signature': False})\n"),  # 11 bad
        "b.js": ("const cp = require('child_process');\n"
                 "cp.exec(`ls ${dir}`);\n"                    # 2 bad
                 "cp.exec('ls');\n"                           # 3 safe
                 "eval(code);\n"                              # 4 bad
                 "https.request({host, rejectUnauthorized: false});\n"  # 5 bad
                 "document.write(html);\n"),                  # 6 bad
        "c.sh": "#!/bin/bash\ncurl -fsSL https://example.invalid/i.sh | bash\n",  # 2 bad
    }
    EXPECTED = {("a.py", 2), ("a.py", 4), ("a.py", 5), ("a.py", 7), ("a.py", 8), ("a.py", 9), ("a.py", 10),
                ("a.py", 11), ("b.js", 2), ("b.js", 4), ("b.js", 5), ("b.js", 6), ("c.sh", 2)}

    def test_rules(self):
        with tempfile.TemporaryDirectory() as d:
            for name, text in self.CASES.items():
                Path(d, name).write_text(text)
            env = dict(os.environ, SEMGREP_SEND_METRICS="off")
            out = subprocess.run([_semgrep(), "scan", "--metrics=off", "--disable-version-check", "--quiet", "--json",
                                  "--config", str(HERE / "rules" / "semgrep.yml"), d],
                                 capture_output=True, text=True, env=env, timeout=300).stdout
            got = {(Path(r["path"]).name, r["start"]["line"]) for r in json.loads(out)["results"]}
        self.assertEqual(got, self.EXPECTED)


if __name__ == "__main__":
    unittest.main()
