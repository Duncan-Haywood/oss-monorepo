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


if __name__ == "__main__":
    unittest.main()


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
