"""Tests for devsec-toolkit. Run: python3 -m unittest test_devsec -v"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import catalog
import devsec

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "tests" / "fixtures" / "vulnerable-repo"
VENTURES = HERE.parent
HAVE_NODE = shutil.which("node") is not None


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = devsec.main(argv)
    return code, out.getvalue(), err.getvalue()


def scan_json(path, *extra):
    code, out, _ = run(["scan", str(path), "--format", "json", *extra])
    return code, json.loads(out)


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location("chk_" + path.parent.name.replace("-", "_"), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class FixtureScan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.code, cls.report = scan_json(FIXTURE)

    def test_every_check_runs_and_fires_on_the_fixture(self):
        # A check that never fires here is untested here: adding one to the
        # catalogue means adding a fixture case that makes it fire.
        statuses = {c["id"]: c["status"] for c in self.report["checks"]}
        fired = {f["check"] for f in self.report["findings"]}
        for check in catalog.CHECKS:
            if check["runtime"] == "node" and not HAVE_NODE:
                self.assertEqual(statuses[check["id"]], "skipped")
                continue
            self.assertEqual(statuses[check["id"]], "ok", check["id"])
            self.assertIn(check["id"], fired, f"{check['id']} produced no finding on the fixture")

    def test_headline_findings(self):
        got = {(f["check"], f["rule"], f["file"], f["line"]) for f in self.report["findings"]}
        for expected in [
            ("actions-injection", "pwn-request-checkout", ".github/workflows/pr.yml", 12),
            ("actions-injection", "script-injection", ".github/workflows/pr.yml", 17),
            ("actions-secret-leak", "transformed-secret", ".github/workflows/pr.yml", 18),
            ("docker-build-secrets", "env-secret", "Dockerfile", 3),
            ("docker-compose-security", "compose-docker-socket", "docker-compose.yml", 6),
            ("k8s-pod-security", "k8s-privileged", "k8s/deployment.yaml", 20),
            ("dependency-confusion", "pip-extra-index-url", "requirements.txt", 1),
            ("jwt-verification-misuse", "jwt-verify-disabled", "src/auth.py", 5),
        ]:
            self.assertIn(expected, got)

    def test_paths_are_relative_to_the_scan_root(self):
        for f in self.report["findings"]:
            self.assertFalse(f["file"].startswith(("/", "./")), f)
            self.assertNotIn("vulnerable-repo", f["file"], f)
            self.assertTrue((FIXTURE / f["file"]).exists(), f)

    def test_every_finding_is_normalised(self):
        for f in self.report["findings"]:
            self.assertIn(f["severity"], catalog.SEVERITIES)
            self.assertTrue(f["rule"] and f["message"], f)
            self.assertEqual(len(f["fingerprint"]), 32)
            self.assertNotEqual(f["message"], f["rule"], f"{f['check']}: message is just the rule name")

    def test_findings_sorted_most_severe_first(self):
        ranks = [catalog.SEVERITY_RANK[f["severity"]] for f in self.report["findings"]]
        self.assertEqual(ranks, sorted(ranks, reverse=True))

    def test_exit_zero_without_fail_on(self):
        self.assertEqual(self.code, 0)


class RiskSetsMatchTheChecks(unittest.TestCase):
    """The catalogue mirrors each check's own idea of a risk; catch drift."""

    def test_python_checks_risk_sets(self):
        for check in catalog.CHECKS:
            if check["runtime"] != "python":
                continue
            mod = load_module(VENTURES / check["entry"])
            risks = set(mod.RISK_CLASSIFICATIONS)
            adapt = check["adapt"]
            if hasattr(adapt, "risk_rules"):
                self.assertEqual(set(adapt.risk_rules), risks, f"{check['id']}: catalogue risk set drifted from {check['entry']}")
            else:
                self.assertIs(adapt, catalog.self_rated_list)
                self.assertEqual(set(mod.SEVERITY), risks, check["id"])
                self.assertLessEqual(set(mod.SEVERITY.values()), set(catalog.SEVERITIES), check["id"])

    def test_every_entry_exists(self):
        for check in catalog.CHECKS:
            self.assertTrue((VENTURES / check["entry"]).is_file(), check["entry"])
            self.assertIn(check["category"], catalog.CATEGORIES)
            self.assertTrue(check["applies"], check["id"])

    def test_ids_unique(self):
        ids = [c["id"] for c in catalog.CHECKS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertFalse(set(ids) & set(catalog.CATEGORIES))


class Sarif(unittest.TestCase):
    def test_structure(self):
        _, out, _ = run(["scan", str(FIXTURE), "--format", "sarif"])
        sarif = json.loads(out)
        self.assertEqual(sarif["version"], "2.1.0")
        run0 = sarif["runs"][0]
        rules = run0["tool"]["driver"]["rules"]
        self.assertEqual(len({r["id"] for r in rules}), len(rules))
        self.assertTrue(run0["results"])
        for res in run0["results"]:
            self.assertEqual(rules[res["ruleIndex"]]["id"], res["ruleId"])
            self.assertIn(res["level"], ("error", "warning", "note"))
            loc = res["locations"][0]["physicalLocation"]
            self.assertFalse(loc["artifactLocation"]["uri"].startswith("/"))
            if "region" in loc:
                self.assertGreaterEqual(loc["region"]["startLine"], 1)
            self.assertIn("devsecFingerprint/v1", res["partialFingerprints"])
        for rule in rules:
            float(rule["properties"]["security-severity"])


class FailOnAndSelection(unittest.TestCase):
    def test_fail_on_high(self):
        code, _, _ = run(["scan", str(FIXTURE), "--fail-on", "high", "--format", "json"])
        self.assertEqual(code, 2)

    def test_fail_on_respects_threshold(self):
        # actions-timeout only ever reports low findings.
        code, _, _ = run(["scan", str(FIXTURE), "--only", "actions-timeout", "--fail-on", "medium", "--format", "json"])
        self.assertEqual(code, 0)
        code, _, _ = run(["scan", str(FIXTURE), "--only", "actions-timeout", "--fail-on", "low", "--format", "json"])
        self.assertEqual(code, 2)

    def test_only_and_skip_by_category(self):
        _, rep = scan_json(FIXTURE, "--only", "containers", "--skip", "docker-base-image-pin")
        ran = {c["id"] for c in rep["checks"]}
        self.assertEqual(ran, {"docker-build-secrets", "docker-compose-security", "docker-base-image-eol"})

    def test_unknown_check_is_a_usage_error(self):
        with self.assertRaises(SystemExit):
            run(["scan", str(FIXTURE), "--only", "no-such-check"])

    def test_default_command_is_scan(self):
        code, out, _ = run([str(FIXTURE), "--only", "actions-injection"])
        self.assertEqual(code, 0)
        self.assertIn("script-injection", out)

    def test_empty_directory_is_not_applicable_not_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out, _ = run(["scan", tmp])
            self.assertEqual(code, 0)
            self.assertIn("Not applicable", out)
            self.assertIn("not that the repository is secure", out)


class ConfigAndBaseline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        shutil.copytree(FIXTURE, self.repo)

    def tearDown(self):
        self.tmp.cleanup()

    def write_config(self, cfg):
        (self.repo / ".devsec.json").write_text(json.dumps(cfg))

    def test_ignore_paths_and_severity_overrides(self):
        self.write_config({
            "ignore_paths": ["k8s/**"],
            "severity": {"actions-timeout": "high", "pinned-actions/mutable": "off"},
            "skip": ["code"],
        })
        _, rep = scan_json(self.repo)
        files = {f["file"] for f in rep["findings"]}
        checks = {f["check"] for f in rep["findings"]}
        self.assertFalse(any(f.startswith("k8s/") for f in files))
        self.assertNotIn("pinned-actions", checks)
        self.assertNotIn("jwt-verification-misuse", checks)
        timeouts = [f for f in rep["findings"] if f["check"] == "actions-timeout"]
        self.assertTrue(timeouts)
        self.assertTrue(all(f["severity"] == "high" for f in timeouts))

    def test_config_fail_on(self):
        self.write_config({"fail_on": "high"})
        code, _ = scan_json(self.repo)
        self.assertEqual(code, 2)

    def test_bad_config_is_reported(self):
        self.write_config({"severity": {"pinned-actions": "critical"}})
        with self.assertRaises(SystemExit):
            run(["scan", str(self.repo)])

    def test_baseline_suppresses_known_and_reports_new(self):
        baseline = Path(self.tmp.name) / "baseline.json"
        run(["scan", str(self.repo), "--write-baseline", str(baseline), "--format", "json"])
        code, rep = scan_json(self.repo, "--baseline", str(baseline), "--fail-on", "low")
        self.assertEqual(code, 0)
        self.assertEqual(rep["findings"], [])
        self.assertGreater(rep["summary"]["baselined"], 40)

        # Shift every line down (known findings must stay suppressed), then add
        # one genuinely new injection (it must be reported).
        wf = self.repo / ".github" / "workflows" / "pr.yml"
        text = wf.read_text()
        text = "# moved\n# down\n" + text + '      - run: echo "${{ github.event.issue.body }}"\n'
        text = text.replace("  reuse:\n", "      - run: echo \"${{ github.event.comment.body }}\"\n  reuse:\n")
        wf.write_text(text)
        code, rep = scan_json(self.repo, "--baseline", str(baseline), "--fail-on", "high")
        self.assertEqual(code, 2)
        new = [(f["check"], f["rule"]) for f in rep["findings"]]
        self.assertIn(("actions-injection", "script-injection"), new)
        self.assertTrue(all(f["check"] == "actions-injection" for f in rep["findings"]), new)

    def test_baseline_from_config_is_relative_to_repo(self):
        run(["scan", str(self.repo), "--write-baseline", str(self.repo / ".devsec-baseline.json"), "--format", "json"])
        self.write_config({"baseline": ".devsec-baseline.json", "fail_on": "low"})
        code, rep = scan_json(self.repo)
        self.assertEqual((code, rep["findings"]), (0, []))


class Robustness(unittest.TestCase):
    def test_missing_runtime_is_skipped_not_clean(self):
        with mock.patch.object(devsec, "interpreter", lambda runtime: None):
            code, rep = scan_json(FIXTURE, "--only", "actions-injection")
        self.assertEqual(rep["checks"][0]["status"], "skipped")
        self.assertEqual(code, 0)
        with mock.patch.object(devsec, "interpreter", lambda runtime: None):
            code, _, _ = run(["scan", str(FIXTURE), "--only", "actions-injection", "--strict"])
        self.assertEqual(code, 1)

    def test_unreadable_output_is_an_error_not_a_crash(self):
        broken = dict(catalog.BY_ID["actions-injection"], adapt=lambda out, err, code: json.loads("not json"))
        result = devsec.run_check(broken, FIXTURE, VENTURES)
        self.assertEqual(result["status"], "error")
        self.assertIn("could not read output", result["error"])

    def test_markdown_escapes_table_cells(self):
        report = {"root": ".", "files_seen": 1, "baselined": 0, "checks": [], "findings": [{
            "check": "actions-injection", "rule": "script-injection", "severity": "high", "file": "a|b.yml",
            "line": 3, "message": "x | y\nz", "fix": "", "fingerprint": "0" * 32, "category": "ci-cd"}]}
        md = devsec.render_markdown(report)
        self.assertIn("a\\|b.yml:3", md)
        self.assertIn("x \\| y z", md)

    def test_fingerprint_ignores_line_numbers(self):
        a = {"check": "c", "rule": "r", "file": "f", "message": "run step at line 18 follows line 14", "line": 18}
        b = dict(a, message="run step at line 20 follows line 16", line=20)
        self.assertEqual(devsec.fingerprint(a), devsec.fingerprint(b))

    def test_glob_match(self):
        self.assertTrue(devsec.glob_match("Dockerfile", "**/Dockerfile"))
        self.assertTrue(devsec.glob_match("a/b/Dockerfile", "**/Dockerfile"))
        self.assertTrue(devsec.glob_match("tests/fixtures/x/y.yml", "tests/fixtures/**"))
        self.assertFalse(devsec.glob_match("src/tests/x.yml", "tests/**"))
        self.assertTrue(devsec.glob_match(".github/workflows/ci.yml", ".github/workflows/*.yml"))


def example_report_text() -> str:
    _, report = scan_json(FIXTURE)
    report["root"] = "vulnerable-repo"
    for c in report["checks"]:
        c["seconds"] = 0
    return (
        "// Generated from tests/fixtures/vulnerable-repo; test_devsec.py keeps it in sync.\n"
        "// Regenerate: python3 test_devsec.py --regenerate-example\n"
        "export default " + json.dumps(report, indent=1) + ";\n"
    )


class PageStaysInSync(unittest.TestCase):
    def test_example_report_matches_a_fresh_fixture_scan(self):
        committed = (HERE / "example-report.mjs").read_text()
        body = json.loads(committed.split("export default ", 1)[1].rstrip().rstrip(";"))
        _, fresh = scan_json(FIXTURE)
        self.assertEqual(
            sorted(f["fingerprint"] for f in body["findings"]),
            sorted(f["fingerprint"] for f in fresh["findings"]),
            "example-report.mjs is stale: python3 test_devsec.py --regenerate-example",
        )

    def test_every_check_is_listed_on_the_page(self):
        page = (HERE / "index.html").read_text()
        for check in catalog.CHECKS:
            self.assertIn(f">{check['id']}</a>", page, check["id"])
            self.assertIn(check["venture"], page, check["venture"])
        self.assertIn(f"{len(catalog.CHECKS)} open-source checks", page)


class Bundle(unittest.TestCase):
    def test_bundle_runs_standalone_and_matches_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "devsec"
            code, _, _ = run(["bundle", str(dest)])
            self.assertEqual(code, 0)
            self.assertTrue((dest / "devsec.py").is_file())
            self.assertTrue((dest / "checks" / "actions-injection-check" / "LICENSE").is_file())
            # Only the check files travel: no venture pages or tests.
            self.assertFalse(list(dest.rglob("*.html")))
            self.assertFalse(list(dest.rglob("test_*.py")))
            import subprocess
            import sys
            proc = subprocess.run([sys.executable, str(dest / "devsec.py"), "scan", str(FIXTURE), "--format", "json"],
                                  capture_output=True, text=True, cwd=tmp, timeout=300)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            bundled = json.loads(proc.stdout)
            _, source = scan_json(FIXTURE)
            self.assertEqual(sorted(f["fingerprint"] for f in bundled["findings"]),
                             sorted(f["fingerprint"] for f in source["findings"]))
            self.assertEqual([c["status"] for c in bundled["checks"]], [c["status"] for c in source["checks"]])


if __name__ == "__main__":
    import sys

    if "--regenerate-example" in sys.argv:
        (HERE / "example-report.mjs").write_text(example_report_text())
        print("wrote example-report.mjs")
    else:
        unittest.main()
