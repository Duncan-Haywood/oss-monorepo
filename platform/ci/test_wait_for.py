import os, sys, tempfile, unittest
import contextlib, io
import subprocess
from wait_for import main, wait, wait_until, wait_pid, pid_alive, matching, wait_gone, ancestors


class WaitFor(unittest.TestCase):
    def test_found(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("a\nDONE\n")
            ok, lines = wait(p, timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "DONE")

    def test_earlier_phase_marker_in_a_held_log_is_stale(self):
        # friction 2026-11-15: phase two appended to phase one's log; the old DONE ended both waits at once
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("phase 1\nDONE\nphase 2 running\n")
            t = [0.0]
            ok, _ = wait(p, timeout=3, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s),
                         held=lambda: [(1, "bash")])
            self.assertFalse(ok)
            # the writer has closed it: the job ended, so the marker stands
            self.assertTrue(wait(p, timeout=1, held=lambda: [])[0])
            self.assertTrue(wait(p, timeout=1, held=lambda: None)[0])
            # a second marker ending the log ends the wait even while held
            open(p, "a").write("DONE\n")
            self.assertTrue(wait(p, timeout=1, held=lambda: [(1, "bash")])[0])

    def test_real_holder_keeps_stale_marker_waiting(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("DONE\nphase 2\n")
            proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"],
                                    stdout=open(p, "a"))
            try:
                t = [0.0]
                ok, _ = wait(p, timeout=2, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
                self.assertFalse(ok)
            finally:
                proc.kill(); proc.wait()
            self.assertTrue(wait(p, timeout=1)[0])

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

    def test_marker_with_trailing_space_matches_as_a_word(self):
        # friction 2026-11-19: --marker 'exit ' waited 540 s on a log ending 'exit 0'
        from wait_for import is_marker
        self.assertTrue(is_marker("exit 0", "exit "))
        self.assertTrue(is_marker("  DONE  ", " DONE "))
        self.assertFalse(is_marker("exited", "exit "))

    def test_default_accepts_lower_case_echo_lines_only(self):
        # friction 2026-11-12..19: `echo exit $?` logs needed --marker exit
        from wait_for import is_quiet_marker
        for line in ("exit 0", "exit 137", "done", "Done", "Exit -1", "  exit 2  "):
            self.assertTrue(is_quiet_marker(line), line)
        for line in ("done loading", "exit code 0", "exited 0", "Done in 3s", "", "doneish"):
            self.assertFalse(is_quiet_marker(line), line)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("tests ran\nexit 0\n")
            ok, lines = wait(p, timeout=1, held=lambda: [])
            self.assertTrue(ok)
            t = [0.0]
            nap = lambda s: t.__setitem__(0, t[0] + s)
            # An explicit marker is still strict about case.
            self.assertFalse(wait(p, marker="EXIT", timeout=3, clock=lambda: t[0], nap=nap)[0])
            # An earlier phase's lower-case line in a held log is stale, as DONE is.
            open(p, "w").write("done\nphase two\n")
            self.assertFalse(wait(p, timeout=3, clock=lambda: t[0], nap=nap, held=lambda: [(1, "x")])[0])

    def test_marker_prefix_of_a_word_does_not_count(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("EXITING soon\nDONEish\n")
            t = [0.0]
            nap = lambda s: t.__setitem__(0, t[0] + s)
            self.assertFalse(wait(p, marker="EXIT", timeout=3, clock=lambda: t[0], nap=nap)[0])
            self.assertFalse(wait(p, timeout=3, clock=lambda: t[0], nap=nap)[0])

    def test_marker_ending_in_equals_or_colon_is_a_prefix(self):
        from wait_for import is_marker
        self.assertTrue(is_marker("rc=0", "rc="))
        self.assertTrue(is_marker("exit: 1", "exit:"))
        self.assertFalse(is_marker("the rc=0 line", "rc="))
        self.assertFalse(is_marker("rc0", "rc="))

    def test_bare_marker_matches_name_equals_value(self):
        # friction 2026-11-16: --marker BUILD_EXIT timed out on a log ending BUILD_EXIT=0
        from wait_for import is_marker
        self.assertTrue(is_marker("BUILD_EXIT=0", "BUILD_EXIT"))
        self.assertFalse(is_marker("BUILD_EXIT_CODE=0", "BUILD_EXIT"))
        self.assertFalse(is_marker("the BUILD_EXIT=0 line", "BUILD_EXIT"))

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

    def test_until_with_a_log_waits_for_its_marker_too(self):
        # friction 2026-11-16: a log given with --until was ignored; "condition met" came before the job's last line
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("working\n")
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([p, "--until", "true", "--timeout", "1", "--ignore-restart"]), 1)
            self.assertIn("no 'DONE' or 'EXIT' line", err.getvalue())
            open(p, "a").write("timing 3.2 s\nDONE\n")
            out = io.StringIO()
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(out):
                self.assertEqual(main([p, "--until", "true", "--timeout", "1", "--ignore-restart"]), 0)
            self.assertIn("timing 3.2 s", out.getvalue())

    def test_until_with_a_missing_log_returns_once_the_condition_holds(self):
        # friction 2026-11-18: a log path that never existed waited 9 minutes after the condition was met
        import wait_for
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "never.log")
            out = io.StringIO()
            old, wait_for.LOG_GRACE = wait_for.LOG_GRACE, 0.0
            try:
                with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(out):
                    self.assertEqual(main([p, "--until", "true", "--timeout", "30", "--ignore-restart"]), 0)
            finally:
                wait_for.LOG_GRACE = old
            self.assertIn("does not exist", out.getvalue())

    def test_log_appears_waits_its_grace_for_the_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "late.log")
            t = [0.0]
            def nap(s):
                t[0] += s
                if t[0] >= 3:
                    open(p, "w").close()
            from wait_for import log_appears
            self.assertTrue(log_appears(p, grace=10, clock=lambda: t[0], nap=nap))
            self.assertFalse(log_appears(os.path.join(d, "no.log"), grace=2, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s)))

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
            live = progress(p, now=lambda: mtime + 5, who=lambda _: None)
            self.assertIn("15 bytes", live)
            self.assertIn("5s ago", live)
            self.assertIn("'step 2'", live)
            self.assertIn("still being written", live)
            self.assertIn("buffering", progress(p, now=lambda: mtime + 600, who=lambda _: None))
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

    def test_pid_one_is_the_smallest_accepted_pid(self):
        # Red team 2026-11-13: `pid <= 0` -> `pid <= 1` survived, which would
        # refuse pid 1 (the container's entry process, a real thing to wait
        # on) with an argparse error. Pin the boundary at 1, not 0 or 2.
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(["--pid", "1", "--timeout", "0"]), 1)


class PidProbe(unittest.TestCase):
    """Red team 2026-11-12: three mutants of the pid and progress probes escaped."""

    def test_probing_a_job_never_signals_it(self):
        # os.kill(pid, 0) only asks; any other signal number would hang up
        # (or kill) the very job the session is waiting for.
        p = subprocess.Popen(["sleep", "30"])
        try:
            for _ in range(3):
                self.assertTrue(pid_alive(p.pid))
            with self.assertRaises(subprocess.TimeoutExpired):
                p.wait(timeout=0.3)
        finally:
            p.kill()
            p.wait()

    def test_another_users_process_counts_as_alive(self):
        # EPERM means the pid exists but belongs to someone else.
        import wait_for
        from unittest import mock
        with mock.patch.object(wait_for.os, "kill", side_effect=PermissionError):
            self.assertTrue(pid_alive(12345))
        with mock.patch.object(wait_for.os, "kill", side_effect=ProcessLookupError):
            self.assertFalse(pid_alive(12345))

    def test_a_live_pid_without_proc_counts_as_alive(self):
        # macOS and BSD have no /proc: os.kill succeeding is all we know.
        import builtins, wait_for
        from unittest import mock
        real_open = builtins.open
        def no_proc(path, *a, **k):
            if str(path).startswith("/proc/"):
                raise FileNotFoundError(path)
            return real_open(path, *a, **k)
        with mock.patch.object(wait_for.os, "kill", return_value=None), \
                mock.patch("builtins.open", no_proc):
            self.assertTrue(pid_alive(12345))

    def test_progress_calls_a_log_silent_from_60s(self):
        from wait_for import progress
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("x\n")
            mtime = os.stat(p).st_mtime
            self.assertIn("still being written", progress(p, now=lambda: mtime + 59.9, who=lambda _: None))
            self.assertIn("silent for a while", progress(p, now=lambda: mtime + 60, who=lambda _: None))

    def test_progress_names_the_process_holding_a_quiet_log(self):
        from wait_for import progress
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").close()
            mtime = os.stat(p).st_mtime
            msg = progress(p, now=lambda: mtime + 600, who=lambda _: [(4000, "bash -c ..."), (4242, "python3 bench.py")])
            self.assertIn("0 bytes", msg)
            self.assertIn("pid 4242", msg)
            self.assertIn("running, quietly", msg)
            self.assertNotIn("stuck", msg)

    def test_progress_keeps_the_end_of_a_long_command(self):
        # friction 2026-11-17: a 60-character head cut showed '--draws 10' for '--draws 1000'
        from wait_for import progress, short_cmd
        cmd = "/usr/bin/python3.13 research/some-programme/experiments/m7t/run.py --seed 3 --draws 1000"
        self.assertTrue(short_cmd(cmd).endswith("--draws 1000"))
        self.assertLessEqual(len(short_cmd(cmd)), 80)
        self.assertEqual(short_cmd("python3 bench.py"), "python3 bench.py")
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").close()
            msg = progress(p, now=lambda: os.stat(p).st_mtime, who=lambda _: [(4242, cmd)])
            self.assertIn("--draws 1000'", msg)

    def test_progress_says_a_log_nobody_holds_is_finished(self):
        from wait_for import progress
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("Traceback\nValueError: x\n")
            mtime = os.stat(p).st_mtime
            msg = progress(p, now=lambda: mtime + 5, who=lambda _: [])
            self.assertIn("no process has it open", msg)
            self.assertIn("read the log", msg)

    @unittest.skipUnless(os.path.isdir("/proc/self/fd"), "needs Linux /proc")
    def test_holders_finds_a_real_writer_and_not_a_closed_file(self):
        import subprocess
        from wait_for import holders
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            with open(p, "w") as f:
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], stdout=f)
            try:
                self.assertIn(child.pid, [pid for pid, _ in holders(p)])
            finally:
                child.kill()
                child.wait()
            self.assertEqual(holders(p), [])


class LongerHint(unittest.TestCase):
    def _main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_short_timeouts_name_the_longer_form(self):
        import wait_for
        self.assertIn("--timeout 540", wait_for.longer(100))
        self.assertIn("run_in_background", wait_for.longer(100))

    def test_a_long_timeout_still_names_the_background_route(self):
        # A 540 s wait that timed out said nothing more, so 40-minute jobs took five calls.
        import wait_for
        hint = wait_for.longer(540)
        self.assertIn("run_in_background", hint)
        self.assertNotIn("--timeout 540", hint)

    def test_every_timeout_line_says_timed_out(self):
        # A chained `; grep` hides exit 1; the text itself must say the wait did not finish.
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("working\n")
            for args in (("--until", "false", "--timeout", "0"), (p, "--timeout", "0"),
                         ("--pid", str(os.getpid()), "--timeout", "0")):
                code, _, err = self._main(*args)
                self.assertEqual(code, 1, args)
                self.assertTrue(err.startswith("wait_for: TIMED OUT (exit 1):"), (args, err))


class Restart(unittest.TestCase):
    """A container restart killed three background jobs in one run (2026-11-13),
    each read as a hang; a log older than the boot, with no marker, is a dead job."""

    def fake(self):
        t = [0.0]
        return t, (lambda: t[0]), (lambda s: t.__setitem__(0, t[0] + s))

    def test_log_older_than_boot_ends_the_wait_after_the_grace(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("Published 11 showcase file(s)\n")
            t, clock, nap = self.fake()
            ok, lines = wait(p, timeout=540, clock=clock, nap=nap, boot=os.stat(p).st_mtime + 5, grace=20)
            self.assertIsNone(ok)
            self.assertEqual(lines[-1], "Published 11 showcase file(s)")
            self.assertGreaterEqual(t[0], 20)
            self.assertLess(t[0], 30)

    def test_log_written_after_boot_or_finished_is_not_a_restart(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("working\n")
            _, clock, nap = self.fake()
            ok, _ = wait(p, timeout=30, clock=clock, nap=nap, boot=os.stat(p).st_mtime - 5)
            self.assertFalse(ok)
            self.assertIsNotNone(ok)
            open(p, "w").write("DONE\n")
            ok, _ = wait(p, timeout=30, clock=clock, nap=nap, boot=os.stat(p).st_mtime + 5)
            self.assertTrue(ok)

    def test_main_exits_2_and_says_to_rerun(self):
        import wait_for
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("half a li")
            os.utime(p, (1000.0, 1000.0))
            err = io.StringIO()
            real = wait_for.boot_time
            wait_for.boot_time = lambda: 2000.0
            try:
                with contextlib.redirect_stderr(err):
                    code = main([p, "--timeout", "0"])
                self.assertEqual(code, 2)
                self.assertIn("container restarted", err.getvalue())
                self.assertIn("Start it again", err.getvalue())
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(main([p, "--timeout", "0", "--ignore-restart"]), 1)
            finally:
                wait_for.boot_time = real

    def test_boot_time_reads_btime(self):
        from wait_for import boot_time
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "stat")
            open(p, "w").write("cpu 1 2 3\nbtime 1794568279\nprocesses 9\n")
            self.assertEqual(boot_time(p), 1794568279.0)
            self.assertIsNone(boot_time(os.path.join(d, "missing")))


if __name__ == "__main__":
    unittest.main()


class Gone(unittest.TestCase):
    """--gone NAME: wait on a job by name without matching wait_for or its shell
    (friction 2026-11-18: `pgrep -f '[b]owling...'` in a line naming the script matched itself)."""

    def test_waits_for_a_named_process_then_returns(self):
        tag = f"gone-test-{os.getpid()}"
        p = subprocess.Popen(["sh", "-c", f"sleep 30 # {tag}"])
        try:
            self.assertTrue(wait_until(f"grep -q {tag} /proc/{p.pid}/cmdline", timeout=5, interval=0.05))
            self.assertIn(p.pid, [pid for pid, _ in matching(tag)])
            with contextlib.redirect_stderr(io.StringIO()) as err:
                self.assertEqual(main(["--gone", tag, "--timeout", "0"]), 1)
            self.assertIn(str(p.pid), err.getvalue())
        finally:
            p.kill()
            p.wait()
        self.assertEqual(matching(tag), [])
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(["--gone", tag, "--timeout", "1"]), 0)
        self.assertIn("no process matches", out.getvalue())

    def test_never_matches_itself_or_its_parents(self):
        # The shell that runs wait_for has NAME on its command line, and so does wait_for.
        tag = f"self-match-{os.getpid()}"
        code = ("import sys; sys.path.insert(0, %r); from wait_for import main; "
                "sys.exit(main(['--gone', %r, '--timeout', '0']))") % (os.path.dirname(os.path.abspath(__file__)), tag)
        r = subprocess.run(["sh", "-c", f"{sys.executable} -c \"{code}\"; echo {tag}"],
                           capture_output=True, text=True, timeout=30)
        self.assertIn("no process matches", r.stdout)
        self.assertIn(os.getpid(), ancestors())

    def test_times_out_while_a_match_lives(self):
        ticks = iter(range(100))
        self.assertFalse(wait_gone("x", timeout=3, clock=lambda: next(ticks), nap=lambda s: None,
                                   find=lambda n: [(1, "x")]))
        self.assertTrue(wait_gone("x", timeout=0, find=lambda n: []))

    def test_rejects_an_empty_name(self):
        # "" is in every command line: the wait could never end.
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
            main(["--gone", " ", "--timeout", "0"])
        self.assertEqual(e.exception.code, 2)
