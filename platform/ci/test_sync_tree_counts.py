"""Tests for sync_tree_counts.py.

The tests that matter are the ones proving this script can be wrong safely.
It rewrites a committed list, so the failure modes worse than missing a
difference are: writing a list from a derivation that broke (the count
version once derived 0 from a status string that does not exist), and
removing a module whose switch broke, which would turn the regression the
guard exists to catch into a quiet one-line edit.
"""

import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path

# Bare-name import with `platform/ci` as the working directory, like every
# other test module here.
import sync_tree_counts as sync

HEADER = "# header line\n#\n"


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        real_repo, real_derive = sync.REPO, sync.optout_switches
        sync.REPO = self.root
        self.addCleanup(lambda: (setattr(sync, "REPO", real_repo),
                                 setattr(sync, "optout_switches", real_derive),
                                 self._tmp.cleanup()))

    def write(self, rel, text=""):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def list_file(self, *names):
        return self.write(sync.LIST, HEADER + "".join(n + "\n" for n in names))

    def run_main(self, found, *flags):
        sync.optout_switches = lambda: found
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = sync.main(list(flags))
        return code, out.getvalue()


class Plan(unittest.TestCase):
    def test_splits_added_deleted_and_stopped(self):
        exists = {"v/b.mjs", "v/c.mjs"}.__contains__
        added, deleted, stopped = sync.plan(["v/a.mjs", "v/b.mjs", "v/c.mjs"],
                                            ["v/c.mjs", "v/d.mjs"], exists=exists)
        self.assertEqual(added, ["v/d.mjs"])
        self.assertEqual(deleted, ["v/a.mjs"])
        self.assertEqual(stopped, ["v/b.mjs"])


class Main(Base):
    def test_new_switch_is_added_in_sorted_place_and_header_kept(self):
        path = self.list_file("v/a.mjs", "v/c.mjs")
        code, _ = self.run_main(["v/a.mjs", "v/b.mjs", "v/c.mjs"])
        self.assertEqual(code, 0)
        self.assertEqual(path.read_text(), HEADER + "v/a.mjs\nv/b.mjs\nv/c.mjs\n")

    def test_deleted_file_is_dropped(self):
        path = self.list_file("v/a.mjs", "v/gone.mjs")
        self.write("v/a.mjs")
        code, _ = self.run_main(["v/a.mjs"])
        self.assertEqual(code, 0)
        self.assertEqual(path.read_text(), HEADER + "v/a.mjs\n")

    def test_stopped_switch_is_never_removed_and_exits_1(self):
        path = self.list_file("v/a.mjs", "v/broken.mjs")
        self.write("v/a.mjs")
        self.write("v/broken.mjs")
        before = path.read_text()
        code, out = self.run_main(["v/a.mjs"])
        self.assertEqual(code, 1)
        self.assertIn("STOPPED  v/broken.mjs", out)
        self.assertEqual(path.read_text(), before)

    def test_check_writes_nothing_and_exits_1_on_difference(self):
        path = self.list_file("v/a.mjs")
        before = path.read_text()
        code, _ = self.run_main(["v/a.mjs", "v/b.mjs"], "--check")
        self.assertEqual(code, 1)
        self.assertEqual(path.read_text(), before)

    def test_check_flags_an_unsorted_list(self):
        self.list_file("v/b.mjs", "v/a.mjs")
        code, out = self.run_main(["v/a.mjs", "v/b.mjs"], "--check")
        self.assertEqual(code, 1)
        self.assertIn("ORDER", out)

    def test_in_step_exits_0_and_rewrites_nothing(self):
        path = self.list_file("v/a.mjs")
        mtime = path.stat().st_mtime_ns
        self.assertEqual(self.run_main(["v/a.mjs"], "--check")[0], 0)
        self.assertEqual(self.run_main(["v/a.mjs"])[0], 0)
        self.assertEqual(path.stat().st_mtime_ns, mtime)

    def test_an_empty_derivation_is_refused_with_exit_2(self):
        path = self.list_file("v/a.mjs")
        before = path.read_text()
        self.assertEqual(self.run_main([])[0], 2)
        self.assertEqual(path.read_text(), before)

    def test_a_derivation_failure_exits_2(self):
        self.list_file("v/a.mjs")

        def boom():
            raise sync.DerivationError("x")
        sync.optout_switches = boom
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sync.main([]), 2)

    def test_a_missing_list_exits_2(self):
        self.assertEqual(self.run_main(["v/a.mjs"])[0], 2)


class Derivation(unittest.TestCase):
    """`optout_switches` shells out to Node; pin how it reads the result."""

    def fake(self, proc):
        calls = []
        real = sync.subprocess.run
        sync.subprocess.run = lambda *a, **k: (calls.append(k), proc)[1]
        self.addCleanup(setattr, sync.subprocess, "run", real)
        return calls

    def test_a_clean_run_returns_sorted_unique_names(self):
        calls = self.fake(subprocess.CompletedProcess(
            [], 0, stdout='noise\n{"switched": ["v/b.mjs", "v/a.mjs", "v/a.mjs"]}\n', stderr=""))
        self.assertEqual(sync.optout_switches(), ["v/a.mjs", "v/b.mjs"])
        self.assertIs(calls[0]["capture_output"], True)
        self.assertIs(calls[0]["text"], True)

    def test_a_nonzero_exit_is_a_derivation_error(self):
        self.fake(subprocess.CompletedProcess([], 1, stdout='{"switched": []}', stderr="boom"))
        with self.assertRaises(sync.DerivationError):
            sync.optout_switches()

    def test_unparseable_output_is_a_derivation_error(self):
        self.fake(subprocess.CompletedProcess([], 0, stdout="not json", stderr=""))
        with self.assertRaises(sync.DerivationError):
            sync.optout_switches()

    def test_a_missing_module_is_a_derivation_error(self):
        real = sync.REPO
        sync.REPO = Path(tempfile.gettempdir()) / "definitely-not-the-repo-12345"
        self.addCleanup(setattr, sync, "REPO", real)
        with self.assertRaises(sync.DerivationError):
            sync.optout_switches()


class RealTree(unittest.TestCase):
    def test_the_committed_list_parses_sorted_and_unique(self):
        _, names = sync.read_list(sync.REPO / sync.LIST)
        self.assertGreater(len(names), 1000)
        self.assertEqual(names, sorted(set(names)))


if __name__ == "__main__":
    unittest.main()
