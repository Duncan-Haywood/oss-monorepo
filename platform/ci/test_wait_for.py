import os, tempfile, unittest
import contextlib, io
import subprocess
from wait_for import main, wait, wait_until, wait_pid, pid_alive


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

    def test_marker_as_first_word(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("build\nEXIT 0\n")
            ok, lines = wait(p, marker="EXIT", timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "EXIT 0")
            open(p, "w").write("DONE: 3 checks\n")
            self.assertTrue(wait(p, timeout=1)[0])

    def test_default_accepts_done_or_exit_but_explicit_marker_is_strict(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("tests ran\nEXIT 1\n")
            ok, lines = wait(p, timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "EXIT 1")
            self.assertEqual(main([p, "--timeout", "0"]), 0)
            t = [0.0]
            nap = lambda s: t.__setitem__(0, t[0] + s)
            self.assertFalse(wait(p, marker="DONE", timeout=3, clock=lambda: t[0], nap=nap)[0])

    def test_marker_prefix_of_a_word_does_not_count(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("EXITING soon\nDONEish\n")
            t = [0.0]
            nap = lambda s: t.__setitem__(0, t[0] + s)
            self.assertFalse(wait(p, marker="EXIT", timeout=3, clock=lambda: t[0], nap=nap)[0])
            self.assertFalse(wait(p, timeout=3, clock=lambda: t[0], nap=nap)[0])

    def test_default_accepts_the_harness_task_file_ending_and_a_dash(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("78\nrc=0\n\n[exited with code 0]\n")
            ok, lines = wait(p, timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "[exited with code 0]")
            open(p, "w").write("ran\nDONE-EXIT 3\n")
            self.assertTrue(wait(p, timeout=1)[0])
            t = [0.0]
            nap = lambda s: t.__setitem__(0, t[0] + s)
            # An explicit marker still waits for itself alone.
            open(p, "w").write("[exited with code 0]\n")
            self.assertFalse(wait(p, marker="DONE", timeout=3, clock=lambda: t[0], nap=nap)[0])

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
        self.assertIn("no 'DONE' or 'EXIT' line", err)
        code, out, _ = self._main("--until", "true")
        self.assertEqual((code, out), (0, "wait_for: condition met\n"))
        code, _, err = self._main("--until", "false", "--timeout", "0")
        self.assertEqual(code, 1)
        self.assertIn("still failing", err)

    def test_pattern_is_an_alias_for_marker(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("x\nEND\n")
            code, out, _ = self._main(p, "--pattern", "END", "--timeout", "1")
        self.assertEqual((code, out), (0, "x\nEND\n"))

    def test_timeout_reports_log_progress(self):
        from wait_for import progress
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            self.assertIn("does not exist yet", progress(p))
            open(p, "w").write("step 1\nstep 2\n\n")
            mtime = os.stat(p).st_mtime
            live = progress(p, now=lambda: mtime + 5)
            self.assertIn("15 bytes", live)
            self.assertIn("5s ago", live)
            self.assertIn("'step 2'", live)
            self.assertIn("still being written", live)
            self.assertIn("buffering", progress(p, now=lambda: mtime + 600))
            code, _, err = self._main(p, "--timeout", "0")
            self.assertEqual(code, 1)
            self.assertIn("last line: 'step 2'", err)

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

    def test_unreaped_child_counts_as_exited(self):
        # A child that exited but was never reaped is a zombie: os.kill still
        # succeeds on it, so only the /proc state field says it is gone.
        p = subprocess.Popen(["true"])
        try:
            self.assertTrue(wait_until(f"grep -q '^State:.*Z' /proc/{p.pid}/status", timeout=5, interval=0.05))
            self.assertFalse(pid_alive(p.pid))
            self.assertEqual(main(["--pid", str(p.pid), "--timeout", "0"]), 0)
        finally:
            p.wait()

    def test_rejects_inputs_that_can_never_mean_done(self):
        # --marker "" matched the first blank line (a false "done"); --pid -1
        # made os.kill probe every process (never done) and --pid 0 was ignored.
        for argv in (["o.log", "--marker", ""], ["o.log", "--marker", "  "],
                     ["--pid", "-1"], ["--pid", "0"]):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), \
                    self.assertRaises(SystemExit) as e:
                main(argv + ["--timeout", "0"])
            self.assertEqual(e.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
