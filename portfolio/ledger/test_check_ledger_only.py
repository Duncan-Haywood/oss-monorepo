#!/usr/bin/env python3
"""Unit tests for the ledger-only check.

Like `test_supersede_check.py`, these build real throwaway repositories rather
than mocking `git`. The check's whole claim is a fact about a diff, and a
mocked `git` would test the mock's idea of the diff instead.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from check_ledger_only import classify, is_ledger_prose, changed_files


def git(cwd, *args):
    subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )


def write(cwd, path, content):
    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


class TestClassify(unittest.TestCase):
    def test_ledger_yaml_is_prose(self):
        self.assertTrue(is_ledger_prose("portfolio/ledger/2026-09.yaml"))

    def test_ledger_markdown_is_prose(self):
        self.assertTrue(is_ledger_prose("portfolio/ledger/README.md"))

    def test_ledger_python_is_tooling_not_prose(self):
        # The exemption that keeps the check from blocking work on itself.
        self.assertFalse(is_ledger_prose("portfolio/ledger/session_gate.py"))
        self.assertFalse(is_ledger_prose("portfolio/ledger/test_break_even.py"))

    def test_venture_file_is_not_prose(self):
        self.assertFalse(is_ledger_prose("ventures/ebay-fee-calculator/index.html"))

    def test_ledger_lookalike_outside_the_dir_is_not_prose(self):
        # `portfolio/ledger-notes/` must not be swept in by a prefix match.
        self.assertFalse(is_ledger_prose("portfolio/ledger-notes/2026-09.yaml"))

    def test_classify_splits_both_ways(self):
        prose, other = classify(
            [
                "portfolio/ledger/2026-09.yaml",
                "ventures/foo/index.html",
                "portfolio/ledger/session_gate.py",
            ]
        )
        self.assertEqual(prose, ["portfolio/ledger/2026-09.yaml"])
        self.assertEqual(
            other, ["ventures/foo/index.html", "portfolio/ledger/session_gate.py"]
        )


class TestAgainstRealGit(unittest.TestCase):
    """Exercise `changed_files` against repositories built on disk."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "t@example.com")
        git(self.repo, "config", "user.name", "Test")
        write(self.repo, "README.md", "seed\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "seed")
        self.cwd = os.getcwd()
        os.chdir(self.repo)

    def tearDown(self):
        os.chdir(self.cwd)
        self.tmp.cleanup()

    def test_commit_mode_sees_a_ledger_only_commit(self):
        write(self.repo, "portfolio/ledger/2026-09.yaml", "- venture: x\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "ledger entry")
        files = changed_files("commit", "HEAD")
        prose, other = classify(files)
        self.assertEqual(prose, ["portfolio/ledger/2026-09.yaml"])
        self.assertEqual(other, [])

    def test_commit_mode_sees_a_mixed_commit_as_fine(self):
        write(self.repo, "portfolio/ledger/2026-09.yaml", "- venture: x\n")
        write(self.repo, "ventures/foo/index.html", "<html></html>\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "ship a thing and record it")
        _, other = classify(changed_files("commit", "HEAD"))
        self.assertEqual(other, ["ventures/foo/index.html"])

    def test_staged_mode_reads_the_index(self):
        write(self.repo, "portfolio/ledger/asks.yaml", "- ask: y\n")
        git(self.repo, "add", "-A")
        prose, other = classify(changed_files("staged", ""))
        self.assertEqual(prose, ["portfolio/ledger/asks.yaml"])
        self.assertEqual(other, [])

    def test_branch_mode_uses_the_merge_base(self):
        # A branch is judged on its own commits, not on everything the base
        # has moved on to since it forked.
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "portfolio/ledger/2026-09.yaml", "- venture: x\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "ledger entry")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "ventures/unrelated/index.html", "<html></html>\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "unrelated work on main")

        git(self.repo, "checkout", "-q", "feature")
        prose, other = classify(changed_files("branch", "main"))
        # main's own commit must not count as this branch's deliverable.
        self.assertEqual(prose, ["portfolio/ledger/2026-09.yaml"])
        self.assertEqual(other, [])


if __name__ == "__main__":
    unittest.main()
