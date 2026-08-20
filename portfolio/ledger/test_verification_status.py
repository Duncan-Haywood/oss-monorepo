#!/usr/bin/env python3
"""Unit tests for the re-verification staleness rule."""
import io
import unittest
from contextlib import redirect_stdout
from unittest import mock

import yaml

import verification_status
from verification_status import (
    RECORDS_PATH,
    classify,
    load_records,
    report,
    scope_of,
    validate_records,
    verdict,
)


def record(**overrides):
    base = {
        "pr": 222,
        "head_sha": "f" * 40,
        "verified_against_main": "a" * 40,
        "verified_at": "2026-08-20T14:33:36Z",
        "result": "pass",
        "note": "ran the full build",
    }
    base.update(overrides)
    return base


class ScopeOf(unittest.TestCase):
    def test_repo_root_file_is_root(self):
        self.assertEqual(scope_of("CLAUDE.md"), ("root", "CLAUDE.md"))

    def test_workflow_is_ci(self):
        self.assertEqual(
            scope_of(".github/workflows/ci.yml"), ("ci", ".github/workflows/ci.yml")
        )

    def test_project_is_top_two_components(self):
        self.assertEqual(
            scope_of("ventures/photo-editing/docs-site/src/x.ts"),
            ("project", "ventures/photo-editing"),
        )

    def test_a_two_component_path_is_its_own_project(self):
        self.assertEqual(
            scope_of("portfolio/ledger/README.md"), ("project", "portfolio/ledger")
        )


class Classify(unittest.TestCase):
    def test_buckets_are_disjoint(self):
        buckets = classify(
            [
                "CLAUDE.md",
                "package.json",
                ".github/workflows/ci.yml",
                ".github/dependabot.yml",
                "ventures/a/src/x.ts",
            ]
        )
        self.assertEqual(buckets["projects"], {"ventures/a"})
        self.assertEqual(buckets["workflows"], {".github/workflows/ci.yml"})
        self.assertEqual(buckets["global_build"], {"package.json"})

    def test_root_documentation_is_not_a_build_input(self):
        # Root docs change most hours; treating them as global would invalidate
        # every record continuously and make the tool useless.
        self.assertEqual(classify(["CLAUDE.md", "README.md"])["global_build"], set())

    def test_venture_metadata_is_not_a_build_input(self):
        # A scoring pass rewrites all eleven VENTURE.yaml files in one commit,
        # and no venture build reads them.
        buckets = classify(["ventures/a/VENTURE.yaml", "ventures/b/NOT-A-VENTURE"])
        self.assertEqual(buckets["projects"], set())


class Verdict(unittest.TestCase):
    def test_disjoint_projects_leave_the_build_valid(self):
        result = verdict(["ventures/a/src/x.ts"], ["ventures/b/src/y.ts"])
        self.assertTrue(result["build_valid"])
        self.assertEqual(result["affected_projects"], [])
        self.assertEqual(result["unaffected_projects"], ["ventures/a"])

    def test_overlap_names_only_the_affected_projects(self):
        result = verdict(
            ["ventures/a/x.ts", "ventures/b/y.ts", "ventures/c/z.ts"],
            ["ventures/b/other.ts"],
        )
        self.assertFalse(result["build_valid"])
        self.assertEqual(result["affected_projects"], ["ventures/b"])
        self.assertEqual(result["unaffected_projects"], ["ventures/a", "ventures/c"])

    def test_root_build_config_invalidates_regardless_of_scope(self):
        result = verdict(["ventures/a/x.ts"], ["pnpm-lock.yaml"])
        self.assertFalse(result["build_valid"])
        self.assertEqual(result["affected_projects"], [])
        self.assertEqual(result["global_build"], ["pnpm-lock.yaml"])

    def test_workflow_drift_invalidates_checks_but_not_the_build(self):
        result = verdict(["ventures/a/x.ts"], [".github/workflows/a-ci.yml"])
        self.assertTrue(result["build_valid"])
        self.assertFalse(result["checks_valid"])
        self.assertEqual(result["workflows"], [".github/workflows/a-ci.yml"])

    def test_no_drift_at_all_leaves_both_valid(self):
        result = verdict(["ventures/a/x.ts"], [])
        self.assertTrue(result["build_valid"])
        self.assertTrue(result["checks_valid"])

    def test_scoping_is_coarse_in_the_safe_direction(self):
        # A sibling app under the same venture counts as affected: coarse
        # scoping over-invalidates rather than under-invalidates.
        result = verdict(["ventures/a/docs-site/x.ts"], ["ventures/a/research/y.ts"])
        self.assertFalse(result["build_valid"])
        self.assertEqual(result["affected_projects"], ["ventures/a"])


class ValidateRecords(unittest.TestCase):
    def test_a_well_formed_file_has_no_errors(self):
        self.assertEqual(validate_records([record()]), [])

    def test_empty_file_is_valid(self):
        self.assertEqual(validate_records([]), [])

    def test_top_level_must_be_a_list(self):
        self.assertEqual(len(validate_records({"pr": 1})), 1)

    def test_short_sha_is_rejected(self):
        errors = validate_records([record(head_sha="fe19bb8")])
        self.assertEqual(len(errors), 1)
        self.assertIn("head_sha", errors[0])

    def test_unquoted_timestamp_parsed_as_datetime_is_rejected(self):
        import datetime

        errors = validate_records(
            [record(verified_at=datetime.datetime(2026, 8, 20, 14, 33, 36))]
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("quoted string", errors[0])

    def test_unknown_result_is_rejected(self):
        self.assertEqual(len(validate_records([record(result="green")])), 1)

    def test_empty_note_is_rejected(self):
        self.assertEqual(len(validate_records([record(note="   ")])), 1)

    def test_duplicate_pull_request_is_rejected(self):
        errors = validate_records([record(), record()])
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicated", errors[0])

    def test_boolean_is_not_accepted_as_a_pull_request_number(self):
        self.assertEqual(len(validate_records([record(pr=True)])), 1)


class RealFile(unittest.TestCase):
    def test_stays_a_mapping_the_router_can_skip(self):
        # allocate.py globs every *.yaml in this directory as a monthly ledger
        # and calls .get("entries") on it. A bare list here crashes the router.
        data = yaml.safe_load(RECORDS_PATH.read_text())
        self.assertIsInstance(data, dict)
        self.assertIsNone(data.get("entries"))

    def test_is_well_formed(self):
        self.assertEqual(validate_records(load_records()), [])


class Report(unittest.TestCase):
    """The report path a scheduled clone actually hits: it lacks the pull
    request head until the tool fetches it, and must catch a stale record."""

    RECORD = record(head_sha="a" * 40, verified_against_main="b" * 40)

    def _run(self, patches):
        with mock.patch.multiple(verification_status, **patches):
            buffer = io.StringIO()
            with redirect_stdout(buffer):
                report([self.RECORD], "origin/main")
            return buffer.getvalue()

    def test_a_pushed_since_head_voids_the_record(self):
        out = self._run(
            {
                "resolve": mock.Mock(return_value="m" * 40),
                "fetch_pr_head": mock.Mock(return_value="c" * 40),
            }
        )
        self.assertIn("VOID", out)
        self.assertIn("pushed since", out)

    def test_a_matching_live_head_is_not_voided(self):
        # head resolves, verified resolves, no drift -> both valid, no VOID.
        out = self._run(
            {
                "resolve": mock.Mock(return_value="m" * 40),
                "fetch_pr_head": mock.Mock(return_value="a" * 40),
                "merge_base": mock.Mock(return_value="base"),
                "changed_files": mock.Mock(return_value=[]),
            }
        )
        self.assertNotIn("VOID", out)
        self.assertIn("VALID", out)

    def test_no_fetch_skips_the_fetch(self):
        fetch = mock.Mock()
        with mock.patch.multiple(
            verification_status,
            resolve=mock.Mock(return_value="m" * 40),
            fetch_pr_head=fetch,
            merge_base=mock.Mock(return_value="base"),
            changed_files=mock.Mock(return_value=[]),
        ):
            with redirect_stdout(io.StringIO()):
                report([self.RECORD], "origin/main", fetch=False)
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
