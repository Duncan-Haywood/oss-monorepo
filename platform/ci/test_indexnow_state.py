"""Guards for `indexnow_state.py`.

The tool answers one question -- has the live catalogue ever actually been
announced to IndexNow? -- and the expensive way for it to be wrong is to
report a confident `never` (or a confident `announced`) for a reason that is
really "this tool could not see". Every case below pins one of those
confusions, because the whole point of the reading is that a submission leaves
no trace in the tree and so cannot be checked by looking at files.
"""

from __future__ import annotations

import unittest

import indexnow_state as state


def _job(runner_id, steps=None, conclusion="failure"):
    return {
        "name": "publish",
        "runner_id": runner_id,
        "runner_name": "" if not runner_id else "gh-runner",
        "conclusion": conclusion,
        "started_at": "2026-09-11T04:15:40Z",
        "completed_at": "2026-09-11T04:15:44Z",
        "steps": steps or [],
    }


def _run(run_id, at, sha="abcdef1234"):
    return {
        "id": run_id,
        "status": "completed",
        "run_started_at": at,
        "created_at": at,
        "head_sha": sha,
        "html_url": f"https://github.com/o/r/actions/runs/{run_id}",
    }


def api_for(runs, jobs_by_run, branch=None, fail_jobs=()):
    """A stub `api(path)` with the same one-argument shape as the real one."""

    def call(path):
        if "/branches/" in path:
            if branch is None:
                raise RuntimeError("HTTP 404")
            return {"commit": branch}
        if "/jobs" in path:
            run_id = int(path.split("/runs/")[1].split("/")[0])
            if run_id in fail_jobs:
                raise RuntimeError("HTTP 403 (rate limited)")
            return {"jobs": jobs_by_run.get(run_id, [])}
        if "/runs?" in path:
            return {"workflow_runs": runs}
        raise AssertionError(f"unexpected path {path}")

    return call


def branch_commit(sha="77654ff472", date="2026-09-11T04:16:35Z", author="CI"):
    return {
        "sha": sha,
        "commit": {"committer": {"date": date}, "author": {"name": author}},
    }


class StepNaming(unittest.TestCase):
    def test_it_matches_every_name_the_step_has_had(self) -> None:
        """A rename must not turn a real past submission into `never`.

        The step was `Notify IndexNow` when it landed (#4366) and is
        `Announce the live snapshot to IndexNow` now. A historical run carries
        the name it ran under.
        """
        self.assertTrue(state.is_announce_step("Notify IndexNow"))
        self.assertTrue(state.is_announce_step("Announce the live snapshot to IndexNow"))
        self.assertTrue(state.is_announce_step("  notify   indexnow  "))

    def test_it_does_not_match_unrelated_steps(self) -> None:
        self.assertFalse(state.is_announce_step("Build and verify the snapshot"))
        self.assertFalse(state.is_announce_step("Say what happened"))
        self.assertFalse(state.is_announce_step(None))


class StarvedRunsAreNotMissingSteps(unittest.TestCase):
    """The regression that shipped in this file's first draft.

    `ci_starvation.classify` returns a `(verdict, detail)` pair. Comparing it
    to the bare string `STARVED` never matched, so a starved run -- which has
    no steps at all -- fell through to `absent`, whose reason reads "the
    workflow carried no announce step". Both say "not announced", which is why
    it looked right; they prescribe different actions (wait for a runner vs.
    fix the workflow), which is why it was not.
    """

    def test_a_starved_job_reads_as_starved_not_absent(self) -> None:
        self.assertEqual(state.announce_outcome([_job(runner_id=0)]), state.STARVED)

    def test_a_real_run_without_the_step_reads_as_absent(self) -> None:
        jobs = [_job(runner_id=1000054728, steps=[{"name": "Build", "conclusion": "success"}])]
        self.assertEqual(state.announce_outcome(jobs), "absent")

    def test_a_real_run_with_the_step_reports_its_conclusion(self) -> None:
        jobs = [
            _job(
                runner_id=1000054728,
                steps=[
                    {"name": "Build", "conclusion": "success"},
                    {"name": "Notify IndexNow", "conclusion": "success"},
                ],
            )
        ]
        self.assertEqual(state.announce_outcome(jobs), "success")

    def test_no_jobs_at_all_is_unknown_not_absent(self) -> None:
        self.assertEqual(state.announce_outcome([]), "unknown")


class Verdicts(unittest.TestCase):
    def test_every_run_starved_is_never_and_says_why(self) -> None:
        runs = [_run(1, "2026-09-11T04:15:40Z"), _run(2, "2026-09-11T03:22:02Z")]
        api = api_for(
            runs,
            {1: [_job(0)], 2: [_job(0)]},
            branch=branch_commit(),
        )
        result = state.collect(api)
        self.assertEqual(result["verdict"], "never")
        self.assertIn("starved", result["reason"])
        self.assertIn("runner_id: 0", result["reason"])
        self.assertEqual(state.exit_code(result, require_announced=True), 1)

    def test_a_successful_step_is_announced(self) -> None:
        runs = [_run(1, "2026-09-11T05:00:00Z")]
        jobs = {
            1: [
                _job(
                    1000054728,
                    steps=[{"name": "Announce the live snapshot to IndexNow", "conclusion": "success"}],
                    conclusion="success",
                )
            ]
        }
        api = api_for(runs, jobs, branch=branch_commit(date="2026-09-11T04:16:35Z"))
        result = state.collect(api)
        self.assertEqual(result["verdict"], "announced")
        self.assertEqual(result["announced"]["run"], 1)
        self.assertEqual(result["covers"], "current")
        self.assertEqual(state.exit_code(result, require_announced=True), 0)

    def test_an_announcement_older_than_the_live_snapshot_is_stale(self) -> None:
        """The live pages must be the ones that were announced.

        A snapshot pushed after the last announcement contains pages nobody has
        asked any engine to look at, which is the ordinary case here: sessions
        republish on every merge.
        """
        runs = [_run(1, "2026-09-10T01:00:00Z")]
        jobs = {
            1: [
                _job(
                    1000054728,
                    steps=[{"name": "Notify IndexNow", "conclusion": "success"}],
                    conclusion="success",
                )
            ]
        }
        api = api_for(runs, jobs, branch=branch_commit(date="2026-09-11T04:16:35Z"))
        result = state.collect(api)
        self.assertEqual(result["verdict"], "announced")
        self.assertEqual(result["covers"], "stale")
        self.assertEqual(
            state.exit_code(result, require_announced=True),
            1,
            "an announcement that predates the live snapshot must not pass the gate",
        )

    def test_an_unreadable_reading_is_unknown_not_never(self) -> None:
        """The direction that matters: absent measurement != measured absence."""
        runs = [_run(1, "2026-09-11T04:15:40Z"), _run(2, "2026-09-11T03:22:02Z")]
        api = api_for(runs, {}, branch=branch_commit(), fail_jobs=(1, 2))
        result = state.collect(api)
        self.assertEqual(result["verdict"], "unknown")
        self.assertIn(
            "is unknown",
            result["reason"],
            "the reason must say the reading failed, not assert a state",
        )
        self.assertEqual(
            state.exit_code(result, require_announced=True),
            2,
            "an unreadable state must not fail as though it were unannounced",
        )

    def test_one_unreadable_run_does_not_sink_the_whole_reading(self) -> None:
        runs = [_run(1, "2026-09-11T05:00:00Z"), _run(2, "2026-09-11T03:22:02Z")]
        jobs = {
            1: [
                _job(
                    1000054728,
                    steps=[{"name": "Notify IndexNow", "conclusion": "success"}],
                    conclusion="success",
                )
            ]
        }
        api = api_for(runs, jobs, branch=branch_commit(date="2026-09-11T04:16:35Z"), fail_jobs=(2,))
        result = state.collect(api)
        self.assertEqual(result["verdict"], "announced")

    def test_no_runs_at_all_is_never_with_its_own_reason(self) -> None:
        api = api_for([], {}, branch=branch_commit())
        result = state.collect(api)
        self.assertEqual(result["verdict"], "never")
        self.assertIn("no completed run", result["reason"])

    def test_an_unpublished_serving_branch_does_not_crash(self) -> None:
        runs = [_run(1, "2026-09-11T04:15:40Z")]
        api = api_for(runs, {1: [_job(0)]}, branch=None)
        result = state.collect(api)
        self.assertIsNone(result["serving"])
        self.assertIsNone(result["covers"])
        self.assertIn("not published", state.render(result))


class Rendering(unittest.TestCase):
    def test_the_never_report_names_the_command_and_where_to_run_it(self) -> None:
        """A verdict a reader cannot act on is worth little.

        An agent session reading this cannot announce -- its proxy 403s the
        host -- so the report has to say that rather than leaving the reader to
        rediscover it.
        """
        runs = [_run(1, "2026-09-11T04:15:40Z")]
        api = api_for(runs, {1: [_job(0)]}, branch=branch_commit())
        text = state.render(state.collect(api))
        self.assertIn("indexnow.mjs --submit --ref gh-pages", text)
        self.assertIn("egress", text)

    def test_the_announced_report_does_not_claim_indexing(self) -> None:
        """Accepted means asked. Overclaiming here is how the row goes wrong."""
        runs = [_run(1, "2026-09-11T05:00:00Z")]
        jobs = {
            1: [
                _job(
                    1000054728,
                    steps=[{"name": "Notify IndexNow", "conclusion": "success"}],
                    conclusion="success",
                )
            ]
        }
        api = api_for(runs, jobs, branch=branch_commit(date="2026-09-11T04:16:35Z"))
        result = state.collect(api)
        self.assertIn("not that anything was indexed", result["reason"])
        self.assertIn("Search Console", state.render(result))

    def test_render_survives_every_verdict(self) -> None:
        for maker in (
            lambda: state.collect(api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())),
            lambda: state.collect(api_for([], {}, branch=branch_commit())),
        ):
            self.assertTrue(state.render(maker()).endswith("\n"))


class ExitCodes(unittest.TestCase):
    def test_without_the_flag_it_always_exits_zero(self) -> None:
        """Bare runs answer a question; they do not fail a build.

        Same split `pages_state.py` makes: folding "is this announced?" into
        the bare exit code would make a green run mean two things.
        """
        result = state.collect(
            api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())
        )
        self.assertEqual(result["verdict"], "never")
        self.assertEqual(state.exit_code(result), 0)


if __name__ == "__main__":
    unittest.main()
