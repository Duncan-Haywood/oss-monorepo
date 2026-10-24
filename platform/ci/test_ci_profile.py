#!/usr/bin/env python3
"""Tests for ci_profile.py.

The tool's job is to say how much of a job is overhead, so most of these pin
the step classification and the jobs it must leave out (never ran, skipped),
because a starved job counted as zero-second work would dilute every share.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import ci_profile as cp


def step(name, start, end):
    return {"name": name, "started_at": f"2026-10-21T01:{start}Z",
            "completed_at": f"2026-10-21T01:{end}Z"}


def job(workflow="Research", name="homepage", runner_id=7, conclusion="success", steps=None,
        created="00:00", started="00:10", completed="02:00"):
    return {
        "workflow_name": workflow,
        "name": name,
        "runner_id": runner_id,
        "conclusion": conclusion,
        "created_at": f"2026-10-21T01:{created}Z",
        "started_at": f"2026-10-21T01:{started}Z",
        "completed_at": f"2026-10-21T01:{completed}Z",
        "steps": steps if steps is not None else [
            step("Set up job", "00:10", "00:11"),
            step("Run actions/checkout@v4", "00:11", "01:51"),
            step("Run actions/setup-python@v5", "01:51", "01:52"),
            step("Run python3 research/_homepage/build.py", "01:52", "01:59"),
            step("Post Run actions/setup-python@v5", "01:59", "01:59"),
            step("Complete job", "01:59", "02:00"),
        ],
    }


class StepKind(unittest.TestCase):
    def test_checkout_and_setup_are_overhead(self):
        self.assertEqual(cp.step_kind("Run actions/checkout@v4"), cp.CHECKOUT)
        self.assertEqual(cp.step_kind("Run actions/setup-node@v4"), cp.SETUP)
        self.assertEqual(cp.step_kind("Set up job"), cp.SETUP)
        self.assertEqual(cp.step_kind("Post Run actions/setup-node@v4"), cp.SETUP)

    def test_a_named_step_is_work(self):
        self.assertEqual(cp.step_kind("node --test in each touched venture"), cp.WORK)
        # A step that only mentions setup in prose is still the job's work.
        self.assertEqual(cp.step_kind("Test the setup wizard"), cp.WORK)
        self.assertEqual(cp.step_kind("Upload Post results"), cp.WORK)


class JobProfile(unittest.TestCase):
    def test_splits_time_by_kind(self):
        p = cp.job_profile(job())
        self.assertEqual(p["seconds"], 110)
        self.assertEqual(p["queue"], 10)
        self.assertEqual(p["kinds"][cp.CHECKOUT], 100)
        self.assertEqual(p["kinds"][cp.WORK], 7)
        self.assertEqual(p["kinds"][cp.SETUP], 3)

    def test_a_job_that_never_got_a_runner_is_left_out(self):
        self.assertIsNone(cp.job_profile(job(runner_id=0)))
        self.assertIsNone(cp.job_profile(job(runner_id=None)))

    def test_a_skipped_job_is_left_out(self):
        self.assertIsNone(cp.job_profile(job(conclusion="skipped")))

    def test_inverted_timestamps_count_as_zero_not_negative(self):
        self.assertEqual(cp.span("2026-10-21T01:00:05Z", "2026-10-21T01:00:01Z"), 0.0)


class Summarise(unittest.TestCase):
    def test_heaviest_workflow_first_with_shares(self):
        rows = cp.summarise([
            job(),
            job(),
            job(workflow="Prompts", name="test", completed="00:30"),
            job(runner_id=0),
        ])
        self.assertEqual([r["workflow"] for r in rows], ["Research", "Prompts"])
        research = rows[0]
        self.assertEqual(research["jobs"], 2)
        self.assertEqual(research["median_job_seconds"], 110)
        self.assertAlmostEqual(research["checkout_share"], 0.91, places=2)
        self.assertEqual(research["heaviest_steps"][0]["name"],
                         "Run python3 research/_homepage/build.py")

    def test_render_flags_an_overhead_dominated_job(self):
        out = cp.render(cp.summarise([job(), job()]), top=5, window="test")
        self.assertIn("Spends half or more", out)
        self.assertIn("Research: median job 110s", out)

    def test_render_does_not_flag_a_job_doing_real_work(self):
        busy = job(steps=[step("Run actions/checkout@v4", "00:10", "00:20"),
                          step("pytest", "00:20", "02:00")])
        out = cp.render(cp.summarise([busy]), top=5, window="test")
        self.assertNotIn("Spends half or more", out)


class Fetch(unittest.TestCase):
    def test_lists_then_reads_each_runs_jobs(self):
        calls = []

        def api(path):
            calls.append(path)
            if "/actions/runs?" in path:
                if "page=1" in path:
                    return {"workflow_runs": [
                        {"id": 2, "created_at": "2026-10-21T01:02:00Z"},
                        {"id": 1, "created_at": "2026-10-21T01:01:00Z"},
                    ]}
                return {"workflow_runs": []}
            return {"jobs": [job()]}

        payload = cp.fetch(api, "o/r", runs=2)
        self.assertEqual(len(payload["jobs"]), 2)
        self.assertIn("(2 runs)", payload["window"])
        self.assertEqual(calls[1:], ["repos/o/r/actions/runs/2/jobs?per_page=100",
                                     "repos/o/r/actions/runs/1/jobs?per_page=100"])


class Main(unittest.TestCase):
    def test_from_json_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "runs.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"window": "w", "jobs": [job()]}, handle)
            out = io.StringIO()
            with unittest.mock.patch("sys.stdout", out):
                self.assertEqual(cp.main(["--from-json", path, "--json"]), 0)
            data = json.loads(out.getvalue())
            self.assertEqual(data["totals"]["jobs"], 1)
            self.assertEqual(data["rows"][0]["workflow"], "Research")

    def test_api_failure_exits_2(self):
        def api(path):
            raise RuntimeError("GET failed: HTTP 403")

        err = io.StringIO()
        with unittest.mock.patch("sys.stderr", err):
            self.assertEqual(cp.main(["--runs", "1"], api=api), 2)
        self.assertIn("HTTP 403", err.getvalue())


if __name__ == "__main__":
    unittest.main()
