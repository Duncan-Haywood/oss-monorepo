"""Tests for repo_files.ls_files, and a guard that tree checks use it."""
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import repo_files

HERE = Path(__file__).resolve().parent


def git(root, *args):
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


class LsFilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        (self.root / ".gitignore").write_text("build/\n")
        (self.root / "a.json").write_text("{}")
        git(self.root, "add", ".")
        (self.root / "new.json").write_text("{,}")
        (self.root / "new.md").write_text("x")
        (self.root / "build").mkdir()
        (self.root / "build" / "out.json").write_text("{}")

    def tearDown(self):
        self.tmp.cleanup()

    def test_local_run_sees_untracked_but_not_ignored(self):
        self.assertEqual(sorted(repo_files.ls_files(self.root, "*.json", untracked=True)),
                         ["a.json", "new.json"])
        self.assertIn("new.md", repo_files.ls_files(self.root, untracked=True))

    def test_tracked_only(self):
        self.assertEqual(repo_files.ls_files(self.root, "*.json", untracked=False), ["a.json"])

    def test_actions_defaults_to_tracked_only(self):
        with mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}, clear=False):
            os.environ.pop("REPO_FILES_UNTRACKED", None)
            self.assertFalse(repo_files.include_untracked())
        with mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "REPO_FILES_UNTRACKED": "1"}):
            self.assertTrue(repo_files.include_untracked())
        with mock.patch.dict(os.environ, {"REPO_FILES_UNTRACKED": "0"}):
            self.assertFalse(repo_files.include_untracked())

    def test_not_a_repo_raises(self):
        with tempfile.TemporaryDirectory() as bare:
            with self.assertRaises(subprocess.CalledProcessError):
                repo_files.ls_files(bare)


class ChecksUseHelperTest(unittest.TestCase):
    """A check that lists files with a bare `git ls-files` passes a new,
    uncommitted file locally and fails it in CI (PR #17568)."""

    def test_no_check_calls_bare_ls_files(self):
        bare = re.compile(r'"ls-files"(?![^\]\n]*"--others")')
        offenders = [p.name for p in sorted(HERE.glob("check_*.py"))
                     if bare.search(p.read_text(encoding="utf-8"))]
        self.assertEqual(offenders, [], "list files with repo_files.ls_files, which adds "
                         "untracked files outside Actions")


if __name__ == "__main__":
    unittest.main()
