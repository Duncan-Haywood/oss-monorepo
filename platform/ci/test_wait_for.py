import os, tempfile, unittest
import contextlib, io
from wait_for import main, wait, wait_until


class WaitFor(unittest.TestCase):
    def test_found(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("a\nDONE\n")
            ok, lines = wait(p, timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "DONE")

    def test_marker_must_be_whole_line(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("not DONE yet\n")
            t = [0.0]
            ok, _ = wait(p, timeout=3, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
            self.assertFalse(ok)

    def test_missing_file_times_out(self):
        t = [0.0]
        ok, _ = wait("/nonexistent/x.log", timeout=5, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
        self.assertFalse(ok)

    def test_until(self):
        self.assertTrue(wait_until("true", timeout=1))
        t = [0.0]
        self.assertFalse(wait_until("false", timeout=3, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s)))

    def test_until_runs_through_a_shell(self):
        self.assertTrue(wait_until("exit 0", timeout=1))
        self.assertTrue(wait_until("false || true", timeout=1))

    def test_until_polls_until_the_command_succeeds(self):
        t = [0.0]
        codes = iter([1, 1, 0])
        calls = []
        def run(cmd, **kw):
            calls.append(cmd)
            return next(codes)
        ok = wait_until("c", timeout=10, interval=2, clock=lambda: t[0],
                        nap=lambda s: t.__setitem__(0, t[0] + s), run=run)
        self.assertTrue(ok)
        self.assertEqual(len(calls), 3)

    def test_deadline_is_inclusive(self):
        def nap(_):
            raise AssertionError("slept past the deadline")
        self.assertEqual(wait("/nonexistent/x.log", timeout=0, clock=lambda: 0.0, nap=nap), (False, []))
        self.assertFalse(wait_until("false", timeout=0, clock=lambda: 0.0, nap=nap))

    def _main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("x\nDONE\n")
            code, out, _ = self._main(p, "--timeout", "1")
            self.assertEqual((code, out), (0, "x\nDONE\n"))
        code, _, err = self._main("/nonexistent/x.log", "--timeout", "0")
        self.assertEqual(code, 1)
        self.assertIn("no 'DONE' line", err)
        code, out, _ = self._main("--until", "true")
        self.assertEqual((code, out), (0, "wait_for: condition met\n"))
        code, _, err = self._main("--until", "false", "--timeout", "0")
        self.assertEqual(code, 1)
        self.assertIn("still failing", err)

    def test_main_prints_only_last_15_lines(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("".join(f"l{i}\n" for i in range(20)) + "DONE\n")
            code, out, _ = self._main(p, "--timeout", "1")
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines(), [f"l{i}" for i in range(6, 20)] + ["DONE"])


if __name__ == "__main__":
    unittest.main()
