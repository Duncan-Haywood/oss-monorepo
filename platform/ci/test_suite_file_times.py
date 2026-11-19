import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import suite_file_times as sft  # noqa: E402


class Proc:
    def __init__(self, rc, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""


class TestFileTimes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        v = self.root / "ventures" / "demo"
        (v / "tests").mkdir(parents=True)
        (v / "node_modules" / "x").mkdir(parents=True)
        for f in ("a.test.mjs", "tests/test_b.py", "c_test.py", "node_modules/x/z.test.mjs", "notes.md"):
            (v / f).write_text("")
        self.v = v

    def tearDown(self):
        self.tmp.cleanup()

    def test_resolve_slug_path_and_missing(self):
        self.assertEqual(sft.resolve("demo", self.root), (self.v.resolve(), "demo"))
        self.assertEqual(sft.resolve("ventures/demo/", self.root), (self.v.resolve(), "demo"))
        self.assertEqual(sft.resolve("ventures", self.root)[1], None)
        self.assertEqual(sft.resolve("nope", self.root), (None, None))

    def test_relative_path_is_from_the_shells_directory(self):
        # `.` from inside a venture is that venture, not the repository root.
        self.assertEqual(sft.resolve(".", self.root, cwd=self.v), (self.v.resolve(), "demo"))
        self.assertEqual(sft.resolve("demo", self.root, cwd=self.v), (self.v.resolve(), "demo"))
        self.assertEqual(sft.resolve(".", self.root, cwd=self.root)[1], None)

    def test_files_skip_node_modules(self):
        names = [str(f.relative_to(self.v)) for f in sft.test_files(self.v)]
        self.assertEqual(names, ["a.test.mjs", "c_test.py", "tests/test_b.py"])

    def test_commands(self):
        argv, cwd = sft.command(self.v / "a.test.mjs", self.v)
        self.assertEqual((argv, cwd), (["node", "--test", "a.test.mjs"], self.v))
        argv, cwd = sft.command(self.v / "tests" / "test_b.py", self.v, py="py")
        self.assertEqual(argv[-1], "test_b.py")
        self.assertEqual(cwd, self.v / "tests")

    def test_time_one_status_and_count(self):
        ticks = iter([0.0, 2.5])
        clock = lambda: next(ticks)
        r = sft.time_one(self.v / "a.test.mjs", self.v, 10,
                         run=lambda *a, **k: Proc(0, "# tests 7\n"), clock=clock)
        self.assertEqual(r, {"file": "a.test.mjs", "seconds": 2.5, "tests": 7, "status": "ok"})
        # unittest's 5 (no tests found) is fine; node's 5 is not
        py = sft.time_one(self.v / "c_test.py", self.v, 10, run=lambda *a, **k: Proc(5))
        self.assertEqual(py["status"], "ok")
        node = sft.time_one(self.v / "a.test.mjs", self.v, 10, run=lambda *a, **k: Proc(5))
        self.assertEqual(node["status"], "FAIL")

        def slow(*a, **k):
            raise subprocess.TimeoutExpired("x", 1)
        self.assertEqual(sft.time_one(self.v / "a.test.mjs", self.v, 1, run=slow)["status"], "TIMEOUT")

    def test_table_sorts_and_folds_the_rest(self):
        rows = [{"file": f, "seconds": s, "tests": 1, "status": "ok"} for f, s in (("a", 1.0), ("b", 5.0), ("c", 2.0))]
        t = sft.table(rows, top=2).splitlines()
        self.assertTrue(t[2].startswith("| b | 5.0"))
        self.assertTrue(t[3].startswith("| c | 2.0"))
        self.assertEqual(t[4], "| (1 more) | 1.0 | | |")

    def test_perf_history_matches_whole_slug_only(self):
        h = self.root / "history"
        h.mkdir()
        (h / "ci-perf-2026-11-10-x.md").write_text("# CI perf: demo, a loop\nSped up demo by 2x.")
        (h / "ci-perf-2026-11-12-y.md").write_text("# CI perf: demo-two\nTouched demo-two only.")
        (h / "ci-perf-2026-11-13-demo-split.md").write_text("split")
        (h / "other.md").write_text("demo")
        self.assertEqual(sft.perf_history("demo", h),
                         [("2026-11-13", "ci-perf-2026-11-13-demo-split.md"),
                          ("2026-11-10", "ci-perf-2026-11-10-x.md")])

    def test_perf_history_ignores_body_mentions(self):
        # a write-up about another suite that quotes the slowest-suites table
        h = self.root / "history"
        h.mkdir()
        (h / "ci-perf-2026-11-18-other.md").write_text("# CI perf: other-suite\nskipped demo and big (table)")
        (h / "ci-perf-2026-11-17-z.md").write_text("intro\n# Perf, 2026-11-17: demo, carry-over\nbody")
        self.assertEqual(sft.perf_history("demo", h), [("2026-11-17", "ci-perf-2026-11-17-z.md")])


if __name__ == "__main__":
    unittest.main()
