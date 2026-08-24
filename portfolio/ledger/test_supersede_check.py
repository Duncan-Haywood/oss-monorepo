#!/usr/bin/env python3
"""Unit tests for the supersede check.

These build real throwaway repositories rather than mocking `git`. The whole
value of the tool is that its answer is a fact about git rather than a summary
anyone wrote down, and a mocked `git` would test the summary instead -- which is
the failure mode it exists to catch.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import supersede_check
from supersede_check import evaluate, render, significant


def git(cwd, *args):
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def write(cwd, path, content):
    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def commit(cwd, message):
    git(cwd, "add", "-A")
    git(cwd, "commit", "-q", "-m", message)


class RepoFixture(unittest.TestCase):
    """A base commit, a branch off it, and a `main` that moved independently."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = self._tmp.name
        self.addCleanup(self._tmp.cleanup)
        self._cwd = os.getcwd()
        self.addCleanup(os.chdir, self._cwd)

        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "config", "user.name", "Test")
        write(self.repo, "calc.mjs", "export function total(a, b) {\n  return a + b;\n}\n")
        commit(self.repo, "base")
        os.chdir(self.repo)


class TestNotSuperseded(RepoFixture):
    def test_a_feature_only_on_the_branch_is_reported_as_dropped(self):
        """The #1006 shape: a whole new module that main never received."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(input) {\n"
            "  return new URLSearchParams(input).toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "unrelated.md", "Some other work landed meanwhile.\n")
        commit(self.repo, "unrelated main work")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertTrue(any(f.missing_from_base for f in verdict.files))
        self.assertIn("share.mjs", render(verdict, "feature", "main"))

    def test_exit_status_is_nonzero_so_it_can_gate_a_close(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 1
        )

    def test_an_edit_to_an_existing_file_still_counts(self):
        """Not every dropped feature arrives as a new file."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n  return a + b;\n}\n"
            "export function compareFeeScenarios(values) {\n  return [50, 75, 100];\n}\n",
        )
        commit(self.repo, "add scenarios")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertFalse(verdict.files[0].missing_from_base)


class TestSuperseded(RepoFixture):
    def test_work_already_merged_into_main_reads_as_safe_to_close(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")
        git(self.repo, "checkout", "-q", "main")
        git(self.repo, "merge", "-q", "--no-ff", "-m", "merge", "feature")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertTrue(verdict.superseded)
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 0
        )

    def test_identical_work_landed_by_a_different_route_reads_as_safe(self):
        """A genuine duplicate: someone else committed the same lines by hand."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "the same thing, committed separately")

        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)

    def test_work_that_landed_under_a_different_filename_is_recognised(self):
        """The tool searches the whole base tree, not just the same path."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "lib/sharing.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "same work, different home")

        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)

    def test_whitespace_and_punctuation_churn_is_not_treated_as_work(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n\n  return a + b;\n\n}\n\n\n",
        )
        commit(self.repo, "reformat only")
        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)


class TestSignificance(unittest.TestCase):
    def test_structural_and_empty_lines_carry_no_evidence(self):
        for line in ["", "   ", "}", "  });", "---", "// ", "'''"]:
            self.assertFalse(significant(line), line)

    def test_short_fragments_match_incidentally_and_are_ignored(self):
        self.assertFalse(significant("let x = 1;"))

    def test_a_real_statement_counts(self):
        self.assertTrue(
            significant("export function compareFeeScenarios(values) {")
        )


class TestRendering(RepoFixture):
    def test_the_report_names_the_lines_that_would_be_lost(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(inputObject) {\n"
            "  return new URLSearchParams(inputObject).toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")

        text = render(evaluate("feature", "main", fetch=False), "feature", "main")
        self.assertIn("NOT SUPERSEDED", text)
        self.assertIn("does not exist on base at all", text)
        self.assertIn("encodeInputs", text)

    def test_an_unknown_ref_is_an_error_rather_than_a_reassuring_pass(self):
        """Failing open here would hand the caller a green light on no evidence."""
        self.assertEqual(
            supersede_check.main(["no-such-branch", "--base", "main", "--no-fetch"]), 2
        )


if __name__ == "__main__":
    unittest.main()
