"""main_health re-runs a check that timed out under load before calling it red."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import main_health as mh  # noqa: E402


class RerunTimeouts(unittest.TestCase):
    def setUp(self):
        self.jobs = [(mh.HERE / "check_a.py",), (mh.HERE / "check_b.py",)]

    def test_timed_out_check_passes_alone(self):
        calls = []

        def runner(path, *args):
            calls.append(path.name)
            return mh.label(path), 0, "fine"

        results = [("check_a.py", 0, ""), ("check_b.py", mh.TIMED_OUT, "timed out after 300 s")]
        out = mh.rerun_timeouts(self.jobs, results, runner=runner)
        self.assertEqual(calls, ["check_b.py"])  # only the timed-out one re-runs
        self.assertEqual([r[1] for r in out], [0, 0])
        self.assertIn("re-run alone", out[1][2])

    def test_real_failure_is_not_rerun(self):
        def runner(*_):
            raise AssertionError("a plain failure must not be re-run")

        results = [("check_a.py", 1, "bad")]
        self.assertEqual(mh.rerun_timeouts(self.jobs, results, runner=runner), results)

    def test_status_names_timeouts(self):
        self.assertEqual(mh.status(mh.TIMED_OUT), "TIME")
        self.assertEqual(mh.status(1), "FAIL")
        self.assertEqual(mh.status(0).strip(), "ok")


class UnitTestJobs(unittest.TestCase):
    def test_test_file_runs_under_unittest_from_platform_ci(self):
        argv, cwd = mh.command(mh.HERE / "test_main_health.py")
        self.assertEqual(argv[1:], ["-m", "unittest", "test_main_health"])
        self.assertEqual(cwd, mh.HERE)

    def test_check_runs_as_a_script_from_the_root(self):
        argv, cwd = mh.command(mh.HERE / "check_x.py", "--flag")
        self.assertEqual(argv[1:], [str(mh.HERE / "check_x.py"), "--flag"])
        self.assertEqual(cwd, mh.ROOT)

    def test_only_platform_ci_tests_count(self):
        self.assertTrue(mh.is_test(mh.HERE / "test_a.py"))
        self.assertFalse(mh.is_test(mh.ROOT / "prompts" / "test_promptctl.py"))
        self.assertFalse(mh.is_test(mh.HERE / "check_a.py"))

    def test_skip_prefix_matches_run_suite(self):
        # A plain pytest-function suite goes through unwired_checks.run_suite; with no
        # pytest it comes back rc 0 + this prefix, and must read SKIP, not ok.
        import unwired_checks
        self.assertEqual(mh.SKIPPED, unwired_checks.SKIPPED)
        self.assertTrue(mh.is_skip(0, f"{mh.SKIPPED} no pytest"))
        self.assertFalse(mh.is_skip(1, f"{mh.SKIPPED} no pytest"))
        self.assertFalse(mh.is_skip(0, "Ran 3 tests OK"))


class PendingRecords(unittest.TestCase):
    """The session's own unfilled run record is PEND, not a red check (2026-11-15)."""
    NAME = "prompts/promptctl.py"
    REC = "prompts/runs/2026-11-15-session_x.json"
    LINE = (f"error: {REC}: outcome must be one of success, partial, failed "
            "(got None); fill it in before merging")

    def test_unfilled_record_not_on_main_is_pending(self):
        out = mh.pending_records(self.NAME, 1, self.LINE, main_has=lambda p: False)
        self.assertEqual(out, [self.REC])

    def test_unfilled_record_on_main_is_a_fault(self):
        self.assertEqual(mh.pending_records(self.NAME, 1, self.LINE, main_has=lambda p: True), [])

    def test_unreadable_main_excuses_nothing(self):
        self.assertEqual(mh.pending_records(self.NAME, 1, self.LINE, main_has=lambda p: None), [])

    def test_any_other_error_keeps_it_red(self):
        text = self.LINE + "\nerror: prompts/runs/y.json: session must be the session URL"
        self.assertEqual(mh.pending_records(self.NAME, 1, text, main_has=lambda p: False), [])

    def test_a_filled_but_wrong_outcome_is_red(self):
        text = self.LINE.replace("(got None)", "(got 'done')")
        self.assertEqual(mh.pending_records(self.NAME, 1, text, main_has=lambda p: False), [])

    def test_other_checks_and_timeouts_untouched(self):
        self.assertEqual(mh.pending_records("check_a.py", 1, self.LINE, main_has=lambda p: False), [])
        self.assertEqual(mh.pending_records(self.NAME, mh.TIMED_OUT, self.LINE,
                                            main_has=lambda p: False), [])

    def test_on_main_reads_origin_main(self):
        if mh.on_main("platform/ci/main_health.py") is None:
            self.skipTest("no origin/main in this clone")
        self.assertTrue(mh.on_main("platform/ci/main_health.py"))
        self.assertFalse(mh.on_main("prompts/runs/no-such-record.json"))


class RunCapturesBothStreams(unittest.TestCase):
    def test_output_joins_stdout_and_stderr(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            script = Path(d) / "check_two_streams.py"
            script.write_text("import sys\nprint('to-out')\nprint('to-err', file=sys.stderr)\n"
                              "sys.exit(3)\n")
            name, rc, text = mh.run(script)
        self.assertEqual((name, rc), ("check_two_streams.py", 3))
        self.assertIn("to-out", text)
        self.assertIn("to-err", text)


class MainVerdict(unittest.TestCase):
    """main() end to end on a fake platform/ci: which lines are red, the exit code and
    the summary. Before 2026-11-22 nothing called main(), so a flipped `rc != 0` in its
    red filter let 6 of 8 seeded faults through."""

    def setUp(self):
        import io
        import tempfile
        from contextlib import redirect_stdout
        from unittest import mock
        import unwired_checks
        self.redirect, self.mock, self.io = redirect_stdout, mock, io
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        here = root / "platform" / "ci"
        here.mkdir(parents=True)
        for n in ("check_good.py", "check_bad.py", "check_pages_links.py", "test_x.py"):
            (here / n).write_text("")
        self.suite = root / "portfolio" / "test_p.py"
        patches = [mock.patch.object(mh, "HERE", here), mock.patch.object(mh, "ROOT", root),
                   mock.patch.object(unwired_checks, "unwired_portfolio_tests",
                                     lambda: [self.suite]),
                   mock.patch.object(unwired_checks, "run_suite", self.fake_suite)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.red = {"check_bad.py"}
        self.ran = []

    def fake_run(self, path, *args, timeout=None):
        name = mh.label(path)
        self.ran.append(name)
        return name, (1 if name in self.red else 0), f"{name} said {'no' if name in self.red else 'yes'}"

    def fake_suite(self, path, timeout=None):
        return self.fake_run(path)

    def main(self, *argv):
        out = self.io.StringIO()
        with self.mock.patch.object(mh, "run", self.fake_run), self.redirect(out):
            rc = mh.main(list(argv))
        return rc, out.getvalue()

    def test_one_red_check_fails_the_run_and_only_it_is_listed(self):
        rc, out = self.main()
        self.assertEqual(rc, 1)
        self.assertIn("FAIL check_bad.py (exit 1)\ncheck_bad.py said no", out)
        self.assertNotIn("check_good.py (exit", out)
        self.assertNotIn("check_pages_links.py", out)  # needs a built site
        self.assertIn("platform/pages/propose_seo_titles.py", self.ran)  # EXTRA, repo-relative
        self.assertIn("6/7 checks pass (5 checks, 1 platform/ci test files, "
                      "1 portfolio test files no PR workflow runs)", out)
        self.assertTrue(out.rstrip().endswith("DONE"))

    def test_all_green_exits_0(self):
        self.red = set()
        rc, out = self.main("--checks-only")
        self.assertEqual(rc, 0)
        self.assertNotIn("(exit", out)
        self.assertNotIn("test_x.py", self.ran)
        self.assertIn("5/5 checks pass\nDONE", out)

    def test_help_names_the_script(self):
        out = self.io.StringIO()
        with self.redirect(out), self.assertRaises(SystemExit):
            mh.main(["--help"])
        self.assertIn(mh.__doc__.splitlines()[0], " ".join(out.getvalue().split()))


if __name__ == "__main__":
    unittest.main()
