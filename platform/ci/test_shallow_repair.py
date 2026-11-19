"""Tests for shallow_repair.py, on a throwaway local repository (no network)."""
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shallow_repair as sr  # noqa: E402

BOGUS = "3f0670a284de6906821bc793e8682b3e1676d7d5"  # the sha a real --shallow-since fetch left, 2026-11-14


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


class ShallowRepairTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        git(self.repo, "init", "-q")
        git(self.repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
            "commit", "-q", "--allow-empty", "-m", "one")
        self.head = git(self.repo, "rev-parse", "HEAD")
        self.shallow = self.repo / ".git" / "shallow"

    def tearDown(self):
        self.tmp.cleanup()

    def test_not_shallow_is_a_no_op(self):
        self.assertEqual(sr.missing_entries(self.repo), [])
        self.assertEqual(sr.repair(self.repo), [])
        self.assertFalse(self.shallow.exists())

    def test_drops_only_the_absent_entry(self):
        self.shallow.write_text(f"{BOGUS}\n{self.head}\n")
        self.assertEqual(sr.missing_entries(self.repo), [BOGUS])
        self.assertEqual(sr.repair(self.repo), [BOGUS])
        self.assertEqual(self.shallow.read_text().split(), [self.head])
        self.assertEqual(sr.repair(self.repo), [])

    def test_fetch_retries_once_after_an_unshallow_error(self):
        calls = []

        def run(cmd, **kw):
            if cmd[:2] == ["git", "fetch"]:
                calls.append(cmd)
                if len(calls) == 1:
                    # git re-lists the bad entry on the failed fetch, as the real failure leaves it.
                    self.shallow.write_text(f"{BOGUS}\n{self.head}\n")
                    return subprocess.CompletedProcess(cmd, 128, "", f"fatal: error in object: unshallow {BOGUS}\n")
                return subprocess.CompletedProcess(cmd, 0, "", "")
            return subprocess.run(cmd, **kw)

        done = sr.fetch(["-q", "--deepen=5", "origin", "main"], cwd=self.repo, run=run)
        self.assertEqual(done.returncode, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.shallow.read_text().split(), [self.head])

    def test_fetch_does_not_retry_other_failures(self):
        calls = []

        def run(cmd, **kw):
            if cmd[:2] == ["git", "fetch"]:
                calls.append(cmd)
                return subprocess.CompletedProcess(cmd, 128, "", "fatal: could not read from remote\n")
            return subprocess.run(cmd, **kw)

        self.assertEqual(sr.fetch(["origin"], cwd=self.repo, run=run).returncode, 128)
        self.assertEqual(len(calls), 1)

    def test_cli_check_then_repair(self):
        self.shallow.write_text(f"{BOGUS}\n{self.head}\n")
        self.assertEqual(sr.main(["--check"], cwd=self.repo), 1)
        self.assertEqual(sr.main([], cwd=self.repo), 0)
        self.assertEqual(sr.main(["--check"], cwd=self.repo), 0)


class LockTest(unittest.TestCase):
    """A timed-out fetch must not strand .git/shallow.lock (SIGKILL skipped git's cleanup, and every
    later fetch failed on the lock; run records 2026-11-16 and 11-18)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        git(self.repo, "init", "-q")
        self.lock = self.repo / ".git" / "shallow.lock"

    def tearDown(self):
        self.tmp.cleanup()

    def test_timeout_sends_sigterm_so_the_child_cleans_its_lock(self):
        # Stands in for git: takes a lock, removes it on SIGTERM as git's lockfile code does.
        script = f"trap 'rm -f {self.lock}; exit 143' TERM; touch {self.lock}; sleep 30 & wait"
        with self.assertRaises(subprocess.TimeoutExpired):
            sr.run_gently(["bash", "-c", script], timeout=1)
        self.assertFalse(self.lock.exists())

    def test_a_child_that_ignores_sigterm_is_killed_after_the_grace(self):
        start = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            sr.run_gently(["bash", "-c", "trap '' TERM; sleep 30 & wait"], timeout=1, grace=1)
        self.assertLess(time.monotonic() - start, 20)

    def test_run_gently_returns_output_like_subprocess_run(self):
        done = sr.run_gently(["bash", "-c", "cat; echo err >&2; exit 3"], input="hi\n")
        self.assertEqual((done.returncode, done.stdout, done.stderr), (3, "hi\n", "err\n"))

    @unittest.skipUnless(Path("/proc").is_dir(), "needs /proc")
    def test_a_lock_no_git_process_owns_is_removed(self):
        self.lock.write_text("x")
        self.assertTrue(sr.clear_stale_lock(self.repo))
        self.assertFalse(self.lock.exists())
        self.assertFalse(sr.clear_stale_lock(self.repo))  # nothing left to remove

    @unittest.skipUnless(Path("/proc").is_dir() and shutil.which("sleep"), "needs /proc and sleep")
    def test_a_lock_is_kept_while_a_git_process_runs_in_the_repo(self):
        # A shell script, not a copy of the sleep binary: the kernel names a script's process
        # after the script file, so /proc/<pid>/comm starts with "git". A copied `sleep` fails on
        # runners whose coreutils is a multicall binary (uutils) that dispatches on its own name
        # and exits at once as "git-sleeper" (red on GitHub's runner, green locally, 2026-11-19).
        fake = self.repo / "git-sleeper"
        fake.write_text('#!/bin/sh\nsleep "$1"\n')
        fake.chmod(0o755)
        self.lock.write_text("x")
        p = subprocess.Popen([str(fake), "30"], cwd=self.repo / ".git", start_new_session=True)
        try:
            for _ in range(100):
                if sr.git_processes_in(self.repo):
                    break
                time.sleep(0.05)
            self.assertTrue(sr.git_processes_in(self.repo), "the fake git process never showed up in /proc")
            self.assertFalse(sr.clear_stale_lock(self.repo))
            self.assertTrue(self.lock.exists())
        finally:
            os.killpg(p.pid, signal.SIGKILL)
            p.wait()

    def test_no_proc_means_nothing_is_called_stale(self):
        self.assertIsNone(sr.git_processes_in(self.repo, proc=self.repo / "no-proc"))

    def test_cli_clears_a_stale_lock(self):
        if not Path("/proc").is_dir():
            self.skipTest("needs /proc")
        self.lock.write_text("x")
        self.assertEqual(sr.main([], cwd=self.repo), 0)
        self.assertFalse(self.lock.exists())


if __name__ == "__main__":
    unittest.main()
