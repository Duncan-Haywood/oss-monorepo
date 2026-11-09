import os, tempfile, unittest
import contextlib, io
import subprocess
from wait_for import main, wait, wait_until, wait_pid


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

    def test_wait_polls_until_the_marker_appears_before_the_deadline(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            t = [0.0]
            def nap(s):
                t[0] += s
                if t[0] >= 4:
                    open(p, "w").write("DONE\n")
            ok, lines = wait(p, timeout=10, interval=2, clock=lambda: t[0], nap=nap)
            self.assertTrue(ok)
            self.assertEqual(lines, ["DONE"])

    def test_wait_pid_deadline_is_inclusive_and_polls(self):
        def nap(_):
            raise AssertionError("slept past the deadline")
        self.assertFalse(wait_pid(1, timeout=0, clock=lambda: 0.0, nap=nap, alive=lambda p: True))
        t = [0.0]
        states = iter([True, True, False])
        self.assertTrue(wait_pid(1, timeout=10, interval=2, clock=lambda: t[0],
                                 nap=lambda s: t.__setitem__(0, t[0] + s), alive=lambda p: next(states)))

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

    def test_help_describes_the_tool_in_first_docstring_line(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            main(["--help"])
        self.assertIn("Wait for a background command to finish", out.getvalue())

    def test_pid(self):
        p = subprocess.Popen(["sleep", "30"])
        try:
            self.assertEqual(main(["--pid", str(p.pid), "--timeout", "0"]), 1)
        finally:
            p.kill()
            p.wait()
        self.assertEqual(main(["--pid", str(p.pid), "--timeout", "1"]), 0)
        self.assertTrue(wait_pid(2**22 + 7, timeout=1))


if __name__ == "__main__":
    unittest.main()
