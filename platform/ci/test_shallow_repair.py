"""Tests for shallow_repair.py, on a throwaway local repository (no network)."""
import subprocess
import sys
import tempfile
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


if __name__ == "__main__":
    unittest.main()
