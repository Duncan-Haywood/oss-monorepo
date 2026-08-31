#!/usr/bin/env python3
"""Tests for ci_starvation.py.

The tool exists to keep two specific misreadings from recurring, so most of
these pin the boundary between them rather than the happy path:

  - a job that finished fast but *did* run must not be called starved;
  - a job that ran long but got no runner must still be called starved.

Both directions matter. Duration is the signal a session reaches for by
instinct, and it is the one that misleads.
"""

import argparse
import io
import unittest
import unittest.mock

import ci_starvation as cs


def job(**overrides):
    """A job that ran on a real runner, unless overridden."""
    base = {
        "id": 1,
        "name": "validate",
        "conclusion": "success",
        "runner_id": 12,
        "runner_name": "gh-runner-4",
        "started_at": "2026-08-26T22:41:49Z",
        "completed_at": "2026-08-26T22:43:28Z",
    }
    base.update(overrides)
    return base


class Classify(unittest.TestCase):
    def test_runner_id_zero_is_starved(self):
        verdict, reason = cs.classify(job(runner_id=0, runner_name=""))
        self.assertEqual(verdict, cs.STARVED)
        self.assertIn("no runner was ever assigned", reason)

    def test_real_runner_id_ran(self):
        verdict, _ = cs.classify(job())
        self.assertEqual(verdict, cs.RAN)

    def test_fast_job_on_a_real_runner_is_not_starved(self):
        """The misreading that merges broken code: a genuine 3-second failure."""
        verdict, _ = cs.classify(
            job(
                conclusion="failure",
                completed_at="2026-08-26T22:41:52Z",
            )
        )
        self.assertEqual(verdict, cs.RAN)

    def test_slow_job_without_a_runner_is_still_starved(self):
        """Duration must not rescue a job that was never scheduled."""
        verdict, _ = cs.classify(
            job(runner_id=0, runner_name="", completed_at="2026-08-26T23:41:49Z")
        )
        self.assertEqual(verdict, cs.STARVED)

    def test_empty_output_does_not_decide(self):
        """An empty body accompanies starvation but also plenty of passing jobs."""
        verdict, _ = cs.classify(job(output={"title": "", "summary": "", "text": ""}))
        self.assertEqual(verdict, cs.RAN)

    def test_missing_runner_id_is_an_error_not_a_guess(self):
        with self.assertRaises(ValueError):
            cs.classify({"id": 7})


class Seconds(unittest.TestCase):
    def test_measures_wall_clock(self):
        self.assertEqual(cs.seconds(job()), 99)

    def test_in_flight_job_has_no_duration(self):
        self.assertIsNone(cs.seconds(job(completed_at=None)))

    def test_unparseable_timestamp_is_none_not_a_crash(self):
        self.assertIsNone(cs.seconds(job(completed_at="whenever")))


class ExitStatus(unittest.TestCase):
    """0 means the results are worth believing; 1 means they are not."""

    def run_main(self, jobs, argv):
        api = unittest.mock.Mock(return_value={"jobs": jobs})
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = cs.main(argv, api=api)
        return code, buf.getvalue()

    def test_all_ran_exits_zero(self):
        code, out = self.run_main([job()], ["--run", "1"])
        self.assertEqual(code, 0)
        self.assertIn("ran on a real runner", out)

    def test_any_starved_exits_one(self):
        code, out = self.run_main(
            [job(), job(id=2, runner_id=0, runner_name="")], ["--run", "1"]
        )
        self.assertEqual(code, 1)
        self.assertIn("1 of 2 job(s) never got a runner", out)

    def test_api_failure_exits_two(self):
        api = unittest.mock.Mock(side_effect=RuntimeError("gh api boom"))
        with unittest.mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(cs.main(["--run", "1"], api=api), 2)

    def test_unclassifiable_job_exits_two_rather_than_guessing(self):
        api = unittest.mock.Mock(return_value={"jobs": [{"id": 7}]})
        with unittest.mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(cs.main(["--run", "1"], api=api), 2)

    def test_json_mode_emits_the_rows(self):
        code, out = self.run_main([job(runner_id=0, runner_name="")], ["--run", "1", "--json"])
        self.assertEqual(code, 1)
        self.assertIn('"verdict": "starved"', out)


class Fetch(unittest.TestCase):
    def test_run_id_asks_for_every_job_in_the_run(self):
        api = unittest.mock.Mock(return_value={"jobs": []})
        cs.fetch(argparse_ns(run="33343422573", job=None), api=api)
        self.assertIn("/actions/runs/33343422573/jobs", api.call_args[0][0])

    def test_job_id_asks_for_the_one_job(self):
        api = unittest.mock.Mock(return_value=job())
        rows = cs.fetch(argparse_ns(run=None, job="99343045465"), api=api)
        self.assertIn("/actions/jobs/99343045465", api.call_args[0][0])
        self.assertEqual(len(rows), 1)


def argparse_ns(**kwargs):
    return argparse.Namespace(**kwargs)


if __name__ == "__main__":
    unittest.main()
