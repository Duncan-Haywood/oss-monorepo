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


if __name__ == "__main__":
    unittest.main()
