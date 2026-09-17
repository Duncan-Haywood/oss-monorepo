#!/usr/bin/env python3
"""Unit tests for the direction-only check.

Like `test_check_ledger_only.py` and `test_supersede_check.py`, these build
real throwaway repositories rather than mocking `git`. The check's whole
claim is a fact about a diff, and a mocked `git` would test the mock's idea
of the diff instead.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from check_direction_only import classify, is_direction_prose, changed_files


def git(cwd, *args):
    subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )


def write(cwd, path, content):
    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


class TestClassify(unittest.TestCase):
    def test_direction_md_is_prose(self):
        self.assertTrue(is_direction_prose("portfolio/DIRECTION.md"))

    def test_agents_md_is_prose(self):
        self.assertTrue(is_direction_prose("AGENTS.md"))

    def test_product_playbook_is_not_prose(self):
        # A different, larger document — restating it isn't the failure
        # mode this check exists for, and folding it in would over-fire.
        self.assertFalse(is_direction_prose("PRODUCT_PLAYBOOK.md"))

    def test_ledger_readme_is_not_direction_prose(self):
        self.assertFalse(is_direction_prose("portfolio/ledger/README.md"))

    def test_nested_agents_md_is_not_the_root_file(self):
        # A venture's own AGENTS.md is a different, legitimate document —
        # only the root file carries the restated fleet-wide brief.
        self.assertFalse(is_direction_prose("ventures/foo/AGENTS.md"))

    def test_venture_file_is_not_prose(self):
        self.assertFalse(is_direction_prose("ventures/ebay-fee-calculator/index.html"))

    def test_classify_splits_both_ways(self):
        prose, other = classify(
            [
                "portfolio/DIRECTION.md",
                "ventures/foo/index.html",
                "AGENTS.md",
            ]
        )
        self.assertEqual(prose, ["portfolio/DIRECTION.md", "AGENTS.md"])
        self.assertEqual(other, ["ventures/foo/index.html"])


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

    def test_commit_mode_sees_a_direction_only_commit(self):
        write(self.repo, "portfolio/DIRECTION.md", "restated brief\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "set direction")
        files = changed_files("commit", "HEAD")
        prose, other = classify(files)
        self.assertEqual(prose, ["portfolio/DIRECTION.md"])
        self.assertEqual(other, [])

    def test_commit_mode_sees_both_direction_files_as_direction_only(self):
        write(self.repo, "portfolio/DIRECTION.md", "restated brief\n")
        write(self.repo, "AGENTS.md", "restated brief too\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "set direction again")
        prose, other = classify(changed_files("commit", "HEAD"))
        self.assertEqual(set(prose), {"portfolio/DIRECTION.md", "AGENTS.md"})
        self.assertEqual(other, [])

    def test_commit_mode_sees_a_mixed_commit_as_fine(self):
        write(self.repo, "portfolio/DIRECTION.md", "a targeted fix\n")
        write(self.repo, "ventures/foo/index.html", "<html></html>\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "ship a thing and correct a number")
        _, other = classify(changed_files("commit", "HEAD"))
        self.assertEqual(other, ["ventures/foo/index.html"])

    def test_staged_mode_reads_the_index(self):
        write(self.repo, "AGENTS.md", "restated brief\n")
        git(self.repo, "add", "-A")
        prose, other = classify(changed_files("staged", ""))
        self.assertEqual(prose, ["AGENTS.md"])
        self.assertEqual(other, [])

    def test_branch_mode_uses_the_merge_base(self):
        # A branch is judged on its own commits, not on everything the base
        # has moved on to since it forked.
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "portfolio/DIRECTION.md", "restated brief\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "set direction")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "ventures/unrelated/index.html", "<html></html>\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "unrelated work on main")

        git(self.repo, "checkout", "-q", "feature")
        prose, other = classify(changed_files("branch", "main"))
        # main's own commit must not count as this branch's deliverable.
        self.assertEqual(prose, ["portfolio/DIRECTION.md"])
        self.assertEqual(other, [])


if __name__ == "__main__":
    unittest.main()
