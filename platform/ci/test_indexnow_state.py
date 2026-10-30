"""Guards for `indexnow_state.py`.

The tool answers one question -- has the live catalogue ever actually been
announced to IndexNow? -- and the expensive way for it to be wrong is to
report a confident `never` (or a confident `announced`) for a reason that is
really "this tool could not see". Every case below pins one of those
confusions, because the whole point of the reading is that a submission leaves
no trace in the tree and so cannot be checked by looking at files.
"""

from __future__ import annotations

import contextlib
import io
import subprocess
import unittest
import unittest.mock

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

    def test_a_run_without_started_at_falls_back_to_created_at(self) -> None:
        run = _run(1, "2026-09-11T05:00:00Z")
        run["run_started_at"] = None
        run["created_at"] = "2026-09-11T04:59:00Z"
        jobs = {
            1: [
                _job(
                    1000054728,
                    steps=[{"name": "Notify IndexNow", "conclusion": "success"}],
                    conclusion="success",
                )
            ]
        }
        result = state.collect(api_for([run], jobs, branch=branch_commit()))
        self.assertEqual(result["examined"][0]["at"], "2026-09-11T04:59:00Z")

    def test_a_run_row_carries_a_nine_character_sha_and_at_most_ten_rows_are_listed(self) -> None:
        runs = [_run(i, f"2026-09-11T05:{59 - i:02d}:00Z", sha="0123456789abcdef") for i in range(1, 13)]
        result = state.collect(api_for(runs, {}, branch=branch_commit()))
        self.assertEqual(result["examined"][0]["head_sha"], "012345678")
        self.assertEqual(len(result["examined"]), 10)
        self.assertEqual(result["examined_count"], 12)

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

    def test_render_shows_the_live_snapshot_sha_or_a_placeholder(self) -> None:
        base = {"verdict": "never", "reason": "r", "examined": []}
        with_sha = state.render({**base, "serving": {"sha": "abcdef0123456789", "date": "d", "author": "a"}})
        self.assertIn("live snapshot     abcdef012 pushed", with_sha)
        without = state.render({**base, "serving": {"date": "d", "author": "a"}})
        self.assertIn("live snapshot     ? pushed", without)

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


class MainFailureMessage(unittest.TestCase):
    def test_a_never_verdict_with_the_flag_fails_with_the_explanation(self) -> None:
        api = api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            code = state.main(["--repo", "o/r", "--require-announced"], api=api)
        self.assertEqual(code, 1)
        self.assertIn("never been announced", err.getvalue())

    def test_exit_zero_prints_no_failure_message(self) -> None:
        api = api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            code = state.main(["--repo", "o/r"], api=api)
        self.assertEqual(code, 0)
        self.assertEqual(err.getvalue(), "")


class ParsingDryRunOutput(unittest.TestCase):
    """`parse_dry_run_output` reads `indexnow.mjs`'s real stdout shape.

    Pinned against the two lines the script actually prints (see its own
    `if (isMain)` block) rather than a shape this file invents, because a
    parser tested only against its own assumptions cannot catch the script
    changing out from under it.
    """

    def test_reads_the_count_and_the_source_breakdown(self) -> None:
        stdout = (
            "indexnow: 975 URL(s) from ref origin/gh-pages\n"
            "  sources:     262 from catalog.json, 975 from 253 published sitemap(s)\n"
            "  origin:      https://duncan-haywood.github.io/oss-monorepo/ "
            "(from artifact (catalog.json))\n"
        )
        parsed = state.parse_dry_run_output(stdout)
        self.assertEqual(parsed["count"], 975)
        self.assertEqual(parsed["sources"], "262 from catalog.json, 975 from 253 published sitemap(s)")

    def test_missing_sources_line_still_yields_a_count(self) -> None:
        """An older `indexnow.mjs` without the sources line must not crash this."""
        parsed = state.parse_dry_run_output("indexnow: 261 URL(s) from ref gh-pages\n")
        self.assertEqual(parsed["count"], 261)
        self.assertIsNone(parsed["sources"])

    def test_unrecognised_output_is_none_not_a_crash(self) -> None:
        self.assertIsNone(state.parse_dry_run_output("node: command not found\n"))
        self.assertIsNone(state.parse_dry_run_output(""))


class LiveCoverage(unittest.TestCase):
    """`live_coverage` degrades on every local-environment failure.

    This is a nice-to-have cross-check layered on top of the GitHub-API
    reading `collect()` already does without any local checkout at all, so a
    session with no `node`, no `origin/gh-pages` fetched, or a script that
    changed shape must get a named reason -- never a crash, and never a
    silently absent row that reads as "nothing to show".
    """

    def test_a_working_dry_run_reports_the_count(self) -> None:
        result = state.live_coverage(run_dry=lambda: {"count": 975, "sources": "some breakdown"})
        self.assertEqual(result, {"count": 975, "sources": "some breakdown", "note": None})

    def test_a_raising_dry_run_degrades_to_a_note(self) -> None:
        def boom():
            raise RuntimeError("origin/gh-pages is not fetched in this clone")

        result = state.live_coverage(run_dry=boom)
        self.assertIsNone(result["count"])
        self.assertIn("not fetched", result["note"])

    def test_run_indexnow_dry_names_a_missing_node(self) -> None:
        with unittest.mock.patch.object(
            state.subprocess, "run", side_effect=FileNotFoundError("node")
        ):
            with self.assertRaises(RuntimeError) as ctx:
                state.run_indexnow_dry(ref="origin/gh-pages")
        self.assertIn("could not run node", str(ctx.exception))

    def test_run_indexnow_dry_captures_output_as_text(self) -> None:
        ok = subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        with unittest.mock.patch.object(state.subprocess, "run", return_value=ok) as run:
            with self.assertRaises(RuntimeError):
                state.run_indexnow_dry(ref="origin/gh-pages")
        self.assertIs(run.call_args.kwargs["text"], True)
        self.assertIs(run.call_args.kwargs["capture_output"], True)

    def test_run_indexnow_dry_names_a_nonzero_exit(self) -> None:
        failed = subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="fatal: bad ref\n")
        with unittest.mock.patch.object(state.subprocess, "run", return_value=failed):
            with self.assertRaises(RuntimeError) as ctx:
                state.run_indexnow_dry(ref="origin/gh-pages")
        self.assertIn("fatal: bad ref", str(ctx.exception))

    def test_a_node_stack_trace_names_the_error_not_the_version_footer(self) -> None:
        """The shape measured on 2026-09-11, verbatim.

        A shallow web-session clone has no `origin/gh-pages`, so `indexnow.mjs`
        throws and Node prints a stack whose LAST line is its own version. The
        row read `would announce unknown -- exited 1: Node.js v22.22.2`, which
        names neither the cause nor the one-command fix that was sitting three
        lines up in the same stderr.
        """
        stderr = (
            "file:///repo/platform/marketing/indexnow.mjs:266\n"
            "      throw new Error(\n"
            "            ^\n"
            "\n"
            "Error: could not read 'catalog.json' from ref 'origin/gh-pages': "
            "Command failed: git -C /repo show origin/gh-pages:catalog.json\n"
            "fatal: invalid object name 'origin/gh-pages'.. Is 'origin/gh-pages' "
            "fetched in this clone? (git fetch origin origin/gh-pages)\n"
            "    at file:///repo/platform/marketing/indexnow.mjs:266:13\n"
            "    at readCatalog (file:///repo/platform/marketing/indexnow.mjs:275:27)\n"
            "\n"
            "Node.js v22.22.2\n"
        )
        failed = subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr=stderr)
        with unittest.mock.patch.object(state.subprocess, "run", return_value=failed):
            with self.assertRaises(RuntimeError) as ctx:
                state.run_indexnow_dry(ref="origin/gh-pages")
        message = str(ctx.exception)
        self.assertIn("could not read 'catalog.json'", message)
        self.assertNotIn("Node.js v", message)
        self.assertNotIn("    at file://", message)
        # The whole reason for preferring this line over the footer: the half
        # that tells the reader what to DO is on the message's SECOND line,
        # because indexnow.mjs wraps a nested git failure. Taking only the
        # first `Error:` line would drop exactly the actionable part.
        self.assertIn("git fetch origin", message)

    def test_most_informative_line_skips_frames_and_footers(self) -> None:
        self.assertEqual(state.most_informative_line(""), None)
        self.assertEqual(state.most_informative_line("   \n\n"), None)
        # No Error: line — fall back past the footer and the frames.
        self.assertEqual(
            state.most_informative_line("something broke\n    at foo (x.mjs:1:1)\nNode.js v22.22.2\n"),
            "something broke",
        )
        # Nothing but a footer still names something rather than returning None.
        self.assertEqual(state.most_informative_line("Node.js v22.22.2\n"), "Node.js v22.22.2")

    def test_most_informative_line_clips_a_pathological_message(self) -> None:
        """A report row must stay renderable even if the tool vomits."""
        clipped = state.most_informative_line("Error: " + ("x" * 5000), limit=120)
        self.assertEqual(len(clipped), 120)
        self.assertTrue(clipped.endswith("…"))

    def test_a_message_exactly_at_the_limit_is_not_clipped(self) -> None:
        exact = "Error: " + ("x" * 13)
        self.assertEqual(state.most_informative_line(exact, limit=len(exact)), exact)

    def test_run_indexnow_dry_names_unparseable_output(self) -> None:
        odd = subprocess.CompletedProcess(args=[], returncode=0, stdout="not the expected shape\n", stderr="")
        with unittest.mock.patch.object(state.subprocess, "run", return_value=odd):
            with self.assertRaises(RuntimeError) as ctx:
                state.run_indexnow_dry(ref="origin/gh-pages")
        self.assertIn("could not parse", str(ctx.exception))


class CollectIncludesLiveCoverage(unittest.TestCase):
    def test_the_live_row_is_injectable_and_present_in_render(self) -> None:
        api = api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())
        result = state.collect(api, run_dry=lambda: {"count": 975, "sources": "262 from catalog.json"})
        self.assertEqual(result["live"], {"count": 975, "sources": "262 from catalog.json", "note": None})
        text = state.render(result)
        self.assertIn("975 URL(s) right now", text)
        self.assertIn("262 from catalog.json", text)

    def test_a_degraded_live_reading_still_renders(self) -> None:
        api = api_for([_run(1, "2026-09-11T04:15:40Z")], {1: [_job(0)]}, branch=branch_commit())

        def boom():
            raise RuntimeError("could not run node (no such file)")

        result = state.collect(api, run_dry=boom)
        self.assertIsNone(result["live"]["count"])
        text = state.render(result)
        self.assertIn("would announce    unknown", text)
        self.assertIn("could not run node", text)

    def test_it_never_changes_the_verdict_or_exit_code(self) -> None:
        """A local-environment fact must not leak into whether it was announced."""
        api = api_for(
            [_run(1, "2026-09-11T05:00:00Z")],
            {
                1: [
                    _job(
                        1000054728,
                        steps=[{"name": "Notify IndexNow", "conclusion": "success"}],
                        conclusion="success",
                    )
                ]
            },
            branch=branch_commit(date="2026-09-11T04:16:35Z"),
        )

        def boom():
            raise RuntimeError("node is not on PATH")

        result = state.collect(api, run_dry=boom)
        self.assertEqual(result["verdict"], "announced")
        self.assertEqual(state.exit_code(result, require_announced=True), 0)


if __name__ == "__main__":
    unittest.main()
