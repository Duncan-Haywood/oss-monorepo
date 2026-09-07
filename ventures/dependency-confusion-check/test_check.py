import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import check


class ScanPipText(unittest.TestCase):
    def test_flags_extra_index_url_in_requirements(self):
        text = "--extra-index-url https://pkgs.internal.example.com/simple/\nrequests==2.31.0\n"
        findings = check.scan_pip_text(text, filename="requirements.txt")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["type"], check.PIP_EXTRA_INDEX_URL)
        self.assertEqual(findings[0]["line"], 1)

    def test_commented_line_is_not_flagged(self):
        text = "# --extra-index-url https://pkgs.internal.example.com/simple/\nrequests==2.31.0\n"
        self.assertEqual(check.scan_pip_text(text), [])

    def test_index_url_alone_is_not_flagged(self):
        text = "--index-url https://pkgs.internal.example.com/simple/\nrequests==2.31.0\n"
        self.assertEqual(check.scan_pip_text(text), [])

    def test_flags_extra_index_url_in_a_workflow_pip_install_step(self):
        text = (
            "on: push\njobs:\n  build:\n    steps:\n"
            "      - run: pip install -r requirements.txt --extra-index-url https://pkgs.internal.example.com/simple/\n"
        )
        findings = check.scan_pip_text(text, filename=".github/workflows/ci.yml")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["line"], 5)

    def test_multiple_occurrences_each_flagged(self):
        text = "--extra-index-url https://a.example.com/simple/\n--extra-index-url https://b.example.com/simple/\n"
        findings = check.scan_pip_text(text)
        self.assertEqual(len(findings), 2)


class ScanNpm(unittest.TestCase):
    PACKAGE_JSON = json.dumps(
        {
            "name": "acme-service",
            "dependencies": {"acme-internal-utils": "^1.0.0", "@acme/other-internal": "^2.0.0", "left-pad": "^1.3.0"},
            "devDependencies": {"acme-test-helpers": "^0.1.0"},
        },
        indent=2,
    )

    def test_unscoped_names_flagged_when_npmrc_sets_private_registry(self):
        # All three unscoped names are flagged, left-pad included: with no
        # network call this tool cannot tell an internal-only name from one
        # already legitimately public, so it surfaces every unscoped name
        # for a human to judge -- see check.py's module docstring.
        npmrc = "registry=https://npm.internal.example.com/\n"
        findings = check.scan_npm(self.PACKAGE_JSON, npmrc)
        names = {f["detail"] for f in findings}
        self.assertEqual(len(findings), 3)
        self.assertTrue(any("acme-internal-utils" in n for n in names))
        self.assertTrue(any("acme-test-helpers" in n for n in names))
        self.assertTrue(any("left-pad" in n for n in names))
        self.assertFalse(any("@acme/other-internal" in n for n in names))

    def test_no_npmrc_means_no_findings(self):
        self.assertEqual(check.scan_npm(self.PACKAGE_JSON, ""), [])

    def test_npmrc_pointing_at_public_registry_is_not_flagged(self):
        npmrc = "registry=https://registry.npmjs.org/\n"
        self.assertEqual(check.scan_npm(self.PACKAGE_JSON, npmrc), [])

    def test_scoped_only_registry_override_is_not_flagged(self):
        npmrc = "@acme:registry=https://npm.internal.example.com/\n"
        self.assertEqual(check.scan_npm(self.PACKAGE_JSON, npmrc), [])

    def test_invalid_json_is_ignored_not_raised(self):
        npmrc = "registry=https://npm.internal.example.com/\n"
        self.assertEqual(check.scan_npm("not json", npmrc), [])

    def test_all_scoped_dependencies_produce_no_findings(self):
        package_json = json.dumps({"dependencies": {"@acme/a": "1.0.0", "@acme/b": "1.0.0"}})
        npmrc = "registry=https://npm.internal.example.com/\n"
        self.assertEqual(check.scan_npm(package_json, npmrc), [])


class DiscoverAndScanPath(unittest.TestCase):
    def test_discovers_requirements_and_constraints_and_pip_conf(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "requirements.txt").write_text("requests\n")
            (root / "requirements-dev.txt").write_text("pytest\n")
            (root / "constraints.txt").write_text("requests==2.31.0\n")
            (root / "pip.conf").write_text("[global]\nextra-index-url = https://x\n")
            files = check.discover_pip_files(root)
            names = sorted(p.name for p in files)
            self.assertEqual(names, ["constraints.txt", "pip.conf", "requirements-dev.txt", "requirements.txt"])

    def test_discovers_workflow_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "ci.yml").write_text("on: push\n")
            files = check.discover_pip_files(root)
            self.assertIn(workflows / "ci.yml", files)

    def test_scan_path_combines_both_ecosystems(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "requirements.txt").write_text("--extra-index-url https://pkgs.internal.example.com/simple/\n")
            (root / "package.json").write_text(
                json.dumps({"dependencies": {"acme-internal-utils": "1.0.0"}})
            )
            (root / ".npmrc").write_text("registry=https://npm.internal.example.com/\n")
            findings = check.scan_path(root)
            types = sorted(f["type"] for f in findings)
            self.assertEqual(types, [check.NPM_UNSCOPED_PRIVATE_DEPENDENCY, check.PIP_EXTRA_INDEX_URL])

    def test_clean_repo_has_no_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "requirements.txt").write_text("requests==2.31.0\n")
            (root / "package.json").write_text(json.dumps({"dependencies": {"left-pad": "1.3.0"}}))
            self.assertEqual(check.scan_path(root), [])


class Main(unittest.TestCase):
    def test_clean_repo_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "requirements.txt").write_text("requests==2.31.0\n")
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 0)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "requirements.txt").write_text("--extra-index-url https://x\n")
            self.assertEqual(check.main([tmp]), 0)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "requirements.txt").write_text("--extra-index-url https://x\n")
            self.assertEqual(check.main([tmp, "--fail-on-risk"]), 2)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "requirements.txt").write_text("--extra-index-url https://x\n")
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "check.py"), tmp, "--format", "json"],
                capture_output=True,
                text=True,
                check=True,
            )
            data = json.loads(result.stdout)
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["type"], "pip-extra-index-url")

    def test_no_manifests_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(check.main([tmp]), 0)


if __name__ == "__main__":
    unittest.main()
