"""Tests for concurrency_tax.py's pull-ref listing, which must read both the
probe clone's `refs/pull/<n>` and a working repository's `refs/pull/<n>/head`."""
import subprocess
import tempfile
import unittest

import concurrency_tax as ct


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], check=True, capture_output=True,
                          text=True).stdout.strip()


class TestPullNumbers(unittest.TestCase):
    def test_reads_both_ref_layouts(self):
        with tempfile.TemporaryDirectory() as repo:
            git(repo, "init", "-q")
            git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q",
                "--allow-empty", "-m", "x")
            for ref in ("refs/pull/7/head", "refs/pull/12"):
                git(repo, "update-ref", ref, "HEAD")
            self.assertEqual(sorted(ct.pull_numbers(repo)), [7, 12])


if __name__ == "__main__":
    unittest.main()
