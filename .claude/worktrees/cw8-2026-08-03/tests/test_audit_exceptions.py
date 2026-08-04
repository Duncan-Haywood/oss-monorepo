#!/usr/bin/env python3
"""
Unit and contract tests for the exception register audit.

A gate that cannot fail is not a gate, so most of these tests assert the
failing direction: an unregistered suppression, an expired grant, a register
that drifted above or below reality. The last two tests are contract tests
against the real repository — they are what make this run on every push.
"""

import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
AUDIT_DIR = REPO_ROOT / "scripts" / "ci"
if str(AUDIT_DIR) not in sys.path:
    sys.path.insert(0, str(AUDIT_DIR))

import audit_exceptions  # noqa: E402
from audit_exceptions import (  # noqa: E402
    MAX_HORIZON_DAYS,
    REQUIRED_FIELDS,
    Occurrence,
    audit,
    load_register,
    scan_file,
    scan_repository,
)

TODAY = date(2026, 7, 31)


def complete_entry(**overrides):
    entry = {
        "id": "EXC-TEST",
        "kind": "lint-suppression",
        "path": "ventures/demo/*",
        "count": 1,
        "owner": "duncan",
        "issue": "docs/EXCEPTION-REGISTER.md#exc-test",
        "reason": "because",
        "compensating_control": "a real one",
        "expires": (TODAY + timedelta(days=30)).isoformat(),
    }
    entry.update(overrides)
    return entry


def occurrence(**overrides):
    values = {
        "path": "ventures/demo/thing.ts",
        "line": 1,
        "kind": "lint-suppression",
        "text": "// eslint-disable-next-line no-explicit-any",
        "description": "ESLint rule disabled inline",
    }
    values.update(overrides)
    return Occurrence(**values)


def codes(findings):
    return sorted(f.code for f in findings)


class TestDetection(unittest.TestCase):
    """The scanner must see each construct the policy names."""

    def scan_source(self, filename, source):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source, encoding="utf-8")
            return scan_file(root, filename)

    def test_detects_eslint_disable(self):
        found = self.scan_source("a.ts", "// eslint-disable-next-line no-any\nconst a = 1;\n")
        self.assertEqual([o.kind for o in found], ["lint-suppression"])
        self.assertEqual(found[0].line, 1)

    def test_detects_ts_suppressions(self):
        source = "// @ts-ignore\nconst a = 1;\n// @ts-expect-error\nconst b = 2;\n"
        found = self.scan_source("a.ts", source)
        self.assertEqual([o.kind for o in found], ["type-suppression", "type-suppression"])

    def test_detects_python_suppressions(self):
        source = (
            "x = 1  # type: ignore[arg-type]\n"
            "y = 2  # noqa: BLE001\n"
            "z = 3  # nosec\n"
            "def f():  # pragma: no cover\n"
            "    pass\n"
        )
        found = self.scan_source("a.py", source)
        self.assertEqual(
            [o.kind for o in found],
            [
                "type-suppression",
                "lint-suppression",
                "scanner-suppression",
                "coverage-suppression",
            ],
        )

    def test_detects_focused_javascript_test(self):
        # `test.only` is the most dangerous construct this audit catches: it
        # drops every other test in the file while still reporting success.
        found = self.scan_source("a.test.ts", 'test.only("thing", () => {});\n')
        self.assertEqual([o.kind for o in found], ["test-skip"])

    def test_detects_skipped_and_todo_javascript_tests(self):
        source = (
            'describe.skip("a", () => {});\n'
            'it.todo("b");\n'
            'xit("c", () => {});\n'
        )
        found = self.scan_source("a.test.ts", source)
        self.assertEqual([o.kind for o in found], ["test-skip"] * 3)

    def test_detects_skipped_python_tests(self):
        source = "@pytest.mark.xfail\ndef test_a():\n    pass\n\n@unittest.skip('x')\ndef test_b():\n    pass\n"
        found = self.scan_source("a.py", source)
        self.assertEqual([o.kind for o in found], ["test-skip", "test-skip"])

    def test_detects_continue_on_error(self):
        found = self.scan_source("w.yml", "steps:\n  - run: x\n    continue-on-error: true\n")
        self.assertEqual([o.kind for o in found], ["ci-tolerance"])

    def test_ignores_unrelated_source(self):
        self.assertEqual(self.scan_source("a.ts", "const only = 1;\n"), [])

    def test_does_not_scan_documentation(self):
        # Docs describe suppressions constantly; scanning them would make the
        # register a catalogue of prose.
        self.assertEqual(self.scan_source("README.md", "Use `# type: ignore` here.\n"), [])


class TestAuditFailsClosed(unittest.TestCase):

    def test_clean_repository_and_matching_register_pass(self):
        findings = audit([occurrence()], [complete_entry()], today=TODAY)
        self.assertEqual(findings, [])

    def test_unregistered_suppression_is_an_error(self):
        findings = audit([occurrence()], [], today=TODAY)
        self.assertEqual(codes(findings), ["unregistered-suppression"])
        self.assertEqual(findings[0].severity, "error")
        self.assertIn("ventures/demo/thing.ts:1", findings[0].where)

    def test_expired_entry_is_an_error(self):
        entry = complete_entry(expires=(TODAY - timedelta(days=1)).isoformat())
        findings = audit([occurrence()], [entry], today=TODAY)
        self.assertIn("expired-exception", codes(findings))

    def test_entry_expiring_today_is_still_valid(self):
        entry = complete_entry(expires=TODAY.isoformat())
        findings = audit([occurrence()], [entry], today=TODAY)
        self.assertEqual(findings, [])

    def test_expiry_beyond_the_horizon_is_an_error(self):
        entry = complete_entry(
            expires=(TODAY + timedelta(days=MAX_HORIZON_DAYS + 1)).isoformat()
        )
        findings = audit([occurrence()], [entry], today=TODAY)
        self.assertIn("expiry-too-distant", codes(findings))

    def test_unparseable_expiry_is_an_error(self):
        findings = audit([occurrence()], [complete_entry(expires="next year")], today=TODAY)
        self.assertIn("unparseable-expiry", codes(findings))

    def test_every_required_field_is_enforced(self):
        for missing_field in REQUIRED_FIELDS:
            with self.subTest(field=missing_field):
                entry = complete_entry()
                del entry[missing_field]
                findings = audit([occurrence()], [entry], today=TODAY)
                self.assertIn(
                    "incomplete-entry",
                    codes(findings),
                    f"dropping '{missing_field}' should fail the audit",
                )

    def test_missing_count_is_reported_once_as_invalid(self):
        # Not also as an exceeded ratchet: one defect, one finding.
        entry = complete_entry()
        del entry["count"]
        findings = audit([occurrence()], [entry], today=TODAY)
        self.assertEqual(codes(findings), ["invalid-count"])

    def test_negative_count_is_an_error(self):
        findings = audit([occurrence()], [complete_entry(count=-1)], today=TODAY)
        self.assertIn("invalid-count", codes(findings))

    def test_non_numeric_count_is_an_error(self):
        findings = audit([occurrence()], [complete_entry(count="many")], today=TODAY)
        self.assertIn("invalid-count", codes(findings))

    def test_new_suppression_beyond_the_registered_count_is_an_error(self):
        occurrences = [occurrence(line=1), occurrence(line=2)]
        findings = audit(occurrences, [complete_entry(count=1)], today=TODAY)
        self.assertIn("count-exceeded", codes(findings))

    def test_register_above_reality_is_an_error(self):
        # The ratchet turns one way: once a suppression is removed the grant
        # must shrink, or the register slowly becomes a list of permissions for
        # code that no longer exists.
        findings = audit([occurrence()], [complete_entry(count=2)], today=TODAY)
        self.assertIn("stale-count", codes(findings))

    def test_entry_matching_nothing_is_an_error(self):
        findings = audit([], [complete_entry(count=1)], today=TODAY)
        self.assertIn("stale-count", codes(findings))
        self.assertIn("delete the entry", findings[0].remedy)

    def test_duplicate_ids_are_an_error(self):
        findings = audit(
            [occurrence()],
            [complete_entry(count=1), complete_entry(path="ventures/other/*", count=0)],
            today=TODAY,
        )
        self.assertIn("duplicate-entry-id", codes(findings))

    def test_entry_does_not_cover_a_different_kind(self):
        findings = audit(
            [occurrence(kind="test-skip")],
            [complete_entry(count=0)],
            today=TODAY,
        )
        self.assertIn("unregistered-suppression", codes(findings))

    def test_entry_does_not_cover_a_different_path(self):
        findings = audit(
            [occurrence(path="ventures/elsewhere/thing.ts")],
            [complete_entry(count=0)],
            today=TODAY,
        )
        self.assertIn("unregistered-suppression", codes(findings))

    def test_code_narrows_an_entry_to_one_rule(self):
        entry = complete_entry(code="no-explicit-any", count=1)
        matching = occurrence(text="// eslint-disable-next-line no-explicit-any")
        other = occurrence(line=2, text="// eslint-disable-next-line no-console")
        findings = audit([matching, other], [entry], today=TODAY)
        self.assertEqual(codes(findings), ["unregistered-suppression"])
        self.assertIn(":2", findings[0].where)

    def test_each_occurrence_is_claimed_by_only_one_entry(self):
        specific = complete_entry(id="EXC-A", code="no-explicit-any", count=1)
        broad = complete_entry(id="EXC-B", count=0)
        self.assertEqual(audit([occurrence()], [specific, broad], today=TODAY), [])


class TestEndToEndOnATrackedFile(unittest.TestCase):
    """Proves the whole chain — git listing, scanning, auditing — reports a
    suppression that someone just committed. The unit tests above cover the
    pieces; this covers the seam between them."""

    def build_repo(self, filename, source):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        env = {
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_NOSYSTEM": "1",
            "PATH": os.environ.get("PATH", ""),
        }
        subprocess.run(["git", "init", "-q"], cwd=root, env=env, check=True)
        (root / filename).write_text(source, encoding="utf-8")
        subprocess.run(["git", "add", filename], cwd=root, env=env, check=True)
        return root

    def test_newly_tracked_focused_test_fails_the_audit(self):
        root = self.build_repo("suite.test.ts", 'test.only("only me", () => {});\n')
        findings = audit(scan_repository(root), [], today=TODAY)
        self.assertEqual(codes(findings), ["unregistered-suppression"])
        self.assertIn("suite.test.ts:1", findings[0].where)

    def test_untracked_file_is_not_scanned(self):
        root = self.build_repo("suite.test.ts", 'test.only("only me", () => {});\n')
        (root / "scratch.ts").write_text("// @ts-ignore\n", encoding="utf-8")
        scanned = {o.path for o in scan_repository(root)}
        self.assertEqual(scanned, {"suite.test.ts"})


class TestRepositoryContract(unittest.TestCase):
    """The gate itself. These fail when a suppression is added or expires."""

    def test_repository_has_no_unregistered_or_expired_exceptions(self):
        findings = audit(scan_repository(REPO_ROOT), load_register(REPO_ROOT))
        self.assertEqual(
            [],
            [f for f in findings if f.severity == "error"],
            "Exception register audit failed:\n"
            + "\n".join(f.format_line() for f in findings),
        )

    def test_register_covers_every_suppression_found(self):
        occurrences = scan_repository(REPO_ROOT)
        self.assertTrue(occurrences, "Expected the scanner to find tracked source to read.")
        registered = sum(int(e.get("count", 0)) for e in load_register(REPO_ROOT))
        self.assertEqual(
            len(occurrences),
            registered,
            "Registered counts must total the suppressions actually present.",
        )

    def test_no_skipped_or_focused_tests_anywhere(self):
        # Distinct from the register: a skipped or focused test is a lost gate,
        # and the repository currently has none. This keeps it that way loudly,
        # rather than letting one be quietly registered.
        skips = [o for o in scan_repository(REPO_ROOT) if o.kind == "test-skip"]
        self.assertEqual(
            [],
            skips,
            "Skipped or focused tests found:\n"
            + "\n".join(f"{o.location()}  {o.text}" for o in skips),
        )

    def test_no_ci_step_tolerates_its_own_failure(self):
        tolerated = [o for o in scan_repository(REPO_ROOT) if o.kind == "ci-tolerance"]
        self.assertEqual(
            [],
            tolerated,
            "CI steps that cannot fail the job:\n"
            + "\n".join(f"{o.location()}  {o.text}" for o in tolerated),
        )

    def test_audit_entrypoint_exits_zero_on_the_real_repository(self):
        self.assertEqual(audit_exceptions.main([]), 0)


if __name__ == "__main__":
    unittest.main()
