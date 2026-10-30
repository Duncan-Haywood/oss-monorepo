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
import json
import os
import tempfile
import unittest
import unittest.mock
import urllib.error

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
            cs.classify({"id": 7, "status": "completed"})

    def test_an_unfinished_job_is_pending_not_a_crash(self):
        """A queued job has no runner_id yet, which is not the unknown-shape case.

        It is the ordinary state of a run you are watching, and raising there
        aborted the whole report with "has no runner_id field" -- which reads
        like the tool is broken at the moment a session points it at a live PR.
        """
        for status in ("queued", "in_progress", "waiting"):
            with self.subTest(status=status):
                verdict, reason = cs.classify(
                    {"id": 7, "name": "validate", "status": status}
                )
                self.assertEqual(verdict, cs.PENDING)
                self.assertIn(status, reason)

    def test_a_job_the_workflow_skipped_is_not_starvation(self):
        """This repo's `preflight` sits in the same run as the real checks."""
        verdict, reason = cs.classify(
            {
                "id": 7,
                "name": "preflight",
                "status": "completed",
                "conclusion": "skipped",
            }
        )
        self.assertEqual(verdict, cs.SKIPPED)
        self.assertIn("never needed a runner", reason)

    def test_a_skipped_job_that_did_get_a_runner_is_still_read_normally(self):
        verdict, _ = cs.classify(job(conclusion="skipped"))
        self.assertEqual(verdict, cs.RAN)

    def test_a_finished_job_is_still_decided_on_runner_id(self):
        """`status: completed` must not shadow the verdict."""
        verdict, _ = cs.classify(job(status="completed", runner_id=0, runner_name=""))
        self.assertEqual(verdict, cs.STARVED)


class Seconds(unittest.TestCase):
    def test_measures_wall_clock(self):
        self.assertEqual(cs.seconds(job()), 99)

    def test_in_flight_job_has_no_duration(self):
        self.assertIsNone(cs.seconds(job(completed_at=None)))

    def test_unparseable_timestamp_is_none_not_a_crash(self):
        self.assertIsNone(cs.seconds(job(completed_at="whenever")))

    def test_a_job_finishing_within_its_first_second_lasted_zero_seconds(self):
        """Zero is a duration; only the backwards stamp of a skipped job is not."""
        self.assertEqual(
            cs.seconds(job(started_at="2026-08-31T05:49:16Z", completed_at="2026-08-31T05:49:16Z")),
            0,
        )

    def test_a_job_lasting_one_second_is_one_second(self):
        self.assertEqual(
            cs.seconds(job(started_at="2026-08-31T05:49:16Z", completed_at="2026-08-31T05:49:17Z")),
            1,
        )

    def test_a_skipped_jobs_backwards_stamps_are_no_duration(self):
        """The API completes a skipped job a second before it starts."""
        self.assertIsNone(
            cs.seconds(
                job(
                    started_at="2026-08-31T05:49:16Z",
                    completed_at="2026-08-31T05:49:15Z",
                )
            )
        )


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
        self.assertIn("got a real runner", out)

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
        api = unittest.mock.Mock(
            return_value={"jobs": [{"id": 7, "status": "completed"}]}
        )
        with unittest.mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(cs.main(["--run", "1"], api=api), 2)

    def test_a_skipped_job_does_not_stop_a_clean_verdict(self):
        code, out = self.run_main(
            [
                job(),
                {"id": 2, "name": "preflight", "status": "completed",
                 "conclusion": "skipped"},
            ],
            ["--run", "1"],
        )
        self.assertEqual(code, 0)
        self.assertIn("1 skipped by the workflow", out)

    def test_an_unfinished_run_exits_two_not_zero(self):
        """`if ci_starvation.py ...` must not pass on results nobody has yet."""
        code, out = self.run_main(
            [job(), {"id": 2, "name": "check", "status": "queued"}], ["--run", "1"]
        )
        self.assertEqual(code, 2)
        self.assertIn("have not finished", out)

    def test_a_decided_starvation_outranks_an_unfinished_job(self):
        """It is already true and will not stop being true when the rest settle."""
        code, out = self.run_main(
            [
                job(runner_id=0, runner_name=""),
                {"id": 2, "name": "check", "status": "queued"},
            ],
            ["--run", "1"],
        )
        self.assertEqual(code, 1)
        self.assertIn("never got a runner", out)
        self.assertIn("still running", out)

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


class ResolveRepo(unittest.TestCase):
    """The HTTPS route has to work out what `gh` got free from the git remote."""

    def test_explicit_flag_wins(self):
        self.assertEqual(
            cs.resolve_repo("o/n", env={"GITHUB_REPOSITORY": "other/thing"}), "o/n"
        )

    def test_falls_back_to_the_actions_environment(self):
        self.assertEqual(cs.resolve_repo(None, env={"GITHUB_REPOSITORY": "o/n"}), "o/n")

    def test_falls_back_to_the_git_remote(self):
        with unittest.mock.patch.object(cs, "git_remote_repo", return_value="o/n"):
            self.assertEqual(cs.resolve_repo(None, env={}), "o/n")

    def test_no_source_is_an_error_not_a_guess(self):
        """Asking the wrong repo returns a 404 that reads like a deleted run."""
        with unittest.mock.patch.object(cs, "git_remote_repo", return_value=None):
            with self.assertRaises(RuntimeError):
                cs.resolve_repo(None, env={})

    def test_malformed_repo_is_rejected(self):
        with self.assertRaises(RuntimeError):
            cs.resolve_repo("just-a-name", env={})


class GitRemoteRepo(unittest.TestCase):
    def remote(self, url):
        proc = unittest.mock.Mock(returncode=0, stdout=url + "\n")
        with unittest.mock.patch.object(cs.subprocess, "run", return_value=proc):
            return cs.git_remote_repo()

    def test_https_remote(self):
        self.assertEqual(self.remote("https://github.com/o/n.git"), "o/n")

    def test_https_remote_without_suffix(self):
        self.assertEqual(self.remote("https://github.com/o/n"), "o/n")

    def test_ssh_remote(self):
        self.assertEqual(self.remote("git@github.com:o/n.git"), "o/n")

    def test_non_github_remote_is_none(self):
        self.assertIsNone(self.remote("https://gitlab.com/o/n.git"))

    def test_no_remote_is_none_not_a_crash(self):
        proc = unittest.mock.Mock(returncode=128, stdout="")
        with unittest.mock.patch.object(cs.subprocess, "run", return_value=proc):
            self.assertIsNone(cs.git_remote_repo())


class GitRemoteCapture(unittest.TestCase):
    def test_git_output_is_captured_not_printed(self):
        proc = unittest.mock.Mock(returncode=0, stdout="https://github.com/o/n.git\n")
        with unittest.mock.patch.object(cs.subprocess, "run", return_value=proc) as run:
            cs.git_remote_repo()
        self.assertTrue(run.call_args.kwargs.get("capture_output"))
        self.assertTrue(run.call_args.kwargs.get("text"))


class ApiToken(unittest.TestCase):
    def test_gh_token_wins(self):
        self.assertEqual(
            cs.api_token({"GH_TOKEN": "a", "GITHUB_TOKEN": "b"}), "a"
        )

    def test_falls_through_to_github_token(self):
        self.assertEqual(cs.api_token({"GITHUB_TOKEN": "b"}), "b")

    def test_blank_token_is_not_a_token(self):
        """An exported-but-empty variable must not be mistaken for a route."""
        self.assertIsNone(cs.api_token({"GH_TOKEN": "  "}))

    def test_no_token_is_none(self):
        self.assertIsNone(cs.api_token({}))


class HttpApi(unittest.TestCase):
    def opener(self, payload=None, error=None):
        def fake(request):
            self.request = request
            if error:
                raise error
            body = json.dumps(payload if payload is not None else {}).encode()
            return unittest.mock.MagicMock(
                __enter__=lambda _self: unittest.mock.Mock(read=lambda: body),
                __exit__=lambda *_: False,
            )

        return fake

    def test_substitutes_the_repository_into_the_path(self):
        call = cs.http_api_for("o/n", "tok", opener=self.opener({"jobs": []}))
        call("repos/{owner}/{repo}/actions/runs/7/jobs")
        self.assertEqual(
            self.request.full_url,
            "https://api.github.com/repos/o/n/actions/runs/7/jobs",
        )

    def test_sends_the_token(self):
        call = cs.http_api_for("o/n", "tok", opener=self.opener({}))
        call("repos/{owner}/{repo}/actions/jobs/7")
        self.assertEqual(self.request.get_header("Authorization"), "Bearer tok")

    def test_returns_the_decoded_payload(self):
        call = cs.http_api_for("o/n", "tok", opener=self.opener({"jobs": [{"id": 1}]}))
        self.assertEqual(call("x"), {"jobs": [{"id": 1}]})

    def test_404_says_it_may_be_permissions(self):
        error = urllib.error.HTTPError("u", 404, "Not Found", {}, None)
        call = cs.http_api_for("o/n", "tok", opener=self.opener(error=error))
        with self.assertRaises(RuntimeError) as caught:
            call("x")
        self.assertIn("cannot read this repo", str(caught.exception))

    def test_403_names_the_missing_scope(self):
        error = urllib.error.HTTPError("u", 403, "Forbidden", {}, None)
        call = cs.http_api_for("o/n", "tok", opener=self.opener(error=error))
        with self.assertRaises(RuntimeError) as caught:
            call("x")
        self.assertIn("Actions: read", str(caught.exception))

    def test_network_failure_is_a_runtime_error(self):
        error = urllib.error.URLError("no route")
        call = cs.http_api_for("o/n", "tok", opener=self.opener(error=error))
        with self.assertRaises(RuntimeError):
            call("x")


class ChooseApi(unittest.TestCase):
    """The regression this whole route exists for: no gh, but a token and a network."""

    def test_gh_is_preferred_when_installed(self):
        api = cs.choose_api(argparse_ns(repo=None), env={}, has_gh=True)
        self.assertIs(api, cs.gh_api)

    def test_without_gh_a_token_is_enough(self):
        api = cs.choose_api(
            argparse_ns(repo="o/n"), env={"GH_TOKEN": "tok"}, has_gh=False
        )
        self.assertTrue(callable(api))
        self.assertIsNot(api, cs.gh_api)

    def test_neither_route_explains_all_three(self):
        with unittest.mock.patch.object(cs, "git_remote_repo", return_value="o/n"):
            with self.assertRaises(RuntimeError) as caught:
                cs.choose_api(argparse_ns(repo=None), env={}, has_gh=False)
        message = str(caught.exception)
        self.assertIn("gh", message)
        self.assertIn("GH_TOKEN", message)
        self.assertIn("--from-json", message)


class JobsFromPayload(unittest.TestCase):
    """All three shapes the Actions API and its wrappers hand back."""

    def test_run_jobs_envelope(self):
        self.assertEqual(cs.jobs_from_payload({"jobs": [job()]}), [job()])

    def test_single_job_object(self):
        self.assertEqual(cs.jobs_from_payload(job()), [job()])

    def test_bare_list(self):
        self.assertEqual(cs.jobs_from_payload([job()]), [job()])

    def test_anything_else_is_an_error(self):
        with self.assertRaises(ValueError):
            cs.jobs_from_payload("nope")


class FromJson(unittest.TestCase):
    """The credential-free route, for a session with neither gh nor a token."""

    def run_from_json(self, payload):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "jobs.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
            buf = io.StringIO()
            with unittest.mock.patch("sys.stdout", buf):
                code = cs.main(["--from-json", path])
            return code, buf.getvalue()

    def test_starved_payload_exits_one(self):
        code, out = self.run_from_json({"jobs": [job(runner_id=0, runner_name="")]})
        self.assertEqual(code, 1)
        self.assertIn("never got a runner", out)

    def test_healthy_payload_exits_zero(self):
        code, out = self.run_from_json({"jobs": [job()]})
        self.assertEqual(code, 0)
        self.assertIn("got a real runner", out)

    def test_no_jobs_is_no_answer_not_healthy(self):
        # 0 tells `if ci_starvation.py --run $ID` that runners are fine; a run
        # with no jobs (not created yet, wrong id) has not shown that.
        for payload in ({"jobs": []}, []):
            code, out = self.run_from_json(payload)
            self.assertEqual(code, 2, payload)
            self.assertIn("no jobs found", out)

    def test_malformed_jobs_value_is_an_error_not_starvation(self):
        # An uncaught TypeError exits 1, which callers read as "starved".
        for payload in ({"jobs": None}, {"jobs": "x"}, {"jobs": 3}):
            code, _ = self.run_from_json(payload)
            self.assertEqual(code, 2, payload)

    def test_it_never_touches_the_api(self):
        api = unittest.mock.Mock()
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "jobs.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"jobs": [job()]}, handle)
            with unittest.mock.patch("sys.stdout", io.StringIO()):
                cs.main(["--from-json", path], api=api)
        api.assert_not_called()

    def test_missing_file_exits_two(self):
        with unittest.mock.patch("sys.stderr", io.StringIO()):
            self.assertEqual(cs.main(["--from-json", "/nonexistent.json"]), 2)


class ManagedPagesBuilder(unittest.TestCase):
    """GitHub's managed Pages builder is not Actions, and never starves.

    Measured 2026-09-17: a session checking whether runners had come back
    picked the most recent run from `/actions/runs`, got a `pages build and
    deployment` run, and this tool answered "All 3 job(s) that ran got a real
    runner. Any failure here is a real result." on runner ids in the
    1000088xxx range -- while `Portfolio validate` one minute earlier was
    `runner_id: 0`. A green from the wrong run is the most expensive wrong
    answer this tool can give.
    """

    def pages_job(self, **overrides):
        return job(workflow_name="pages build and deployment", **overrides)

    def test_detected_from_the_job_payload_alone(self):
        # Not from the run's `path`: --from-json has no run to fetch, and that
        # is the one route with no credential of its own.
        self.assertTrue(cs.is_managed_pages(self.pages_job()))
        self.assertFalse(cs.is_managed_pages(job(workflow_name="Portfolio validate")))
        self.assertFalse(cs.is_managed_pages(job()))

    def test_detection_ignores_case_and_padding(self):
        self.assertTrue(cs.is_managed_pages(job(workflow_name="  Pages Build And Deployment ")))

    def test_render_withholds_a_verdict(self):
        out = cs.render(cs.report([self.pages_job()]))
        self.assertIn("NO VERDICT", out)
        # The sentence that made the original mistake reassuring must be gone.
        self.assertNotIn("Any failure here is a real result", out)

    def test_exits_two_not_zero(self):
        # 0 would tell `if ci_starvation.py --run $ID` that runners are fine
        # in the middle of an outage. 2 is the tool's "no answer" code.
        with unittest.mock.patch("sys.stdout", io.StringIO()):
            code = cs.main(["--run", "1"], api=lambda _p: {"jobs": [self.pages_job()]})
        self.assertEqual(code, 2)

    def test_a_real_workflow_run_is_unaffected(self):
        with unittest.mock.patch("sys.stdout", io.StringIO()):
            starved = cs.main(
                ["--run", "1"],
                api=lambda _p: {"jobs": [job(workflow_name="Portfolio validate", runner_id=0)]},
            )
            ran = cs.main(
                ["--run", "1"],
                api=lambda _p: {"jobs": [job(workflow_name="Portfolio validate")]},
            )
        self.assertEqual(starved, 1)
        self.assertEqual(ran, 0)

    def test_a_mixed_payload_still_reaches_the_ordinary_verdict(self):
        # Only --from-json can stitch two runs together, and there the Actions
        # jobs are the ones with something to say.
        rows = cs.report([self.pages_job(), job(workflow_name="Portfolio validate", runner_id=0)])
        self.assertFalse(cs.all_managed_pages(rows))
        self.assertIn("never got a runner", cs.render(rows))


class RenderCounts(unittest.TestCase):
    def test_clean_verdict_counts_only_jobs_that_ran(self):
        rows = cs.report([job(), job(id=3), {"id": 2, "name": "preflight", "status": "completed", "conclusion": "skipped"}])
        out = cs.render(rows)
        self.assertIn("All 2 job(s) that ran", out)
        self.assertIn("(1 skipped by the workflow.)", out)


class StarvedAndPending(unittest.TestCase):
    def test_pending_note_appears_only_when_starved_and_pending_together(self):
        starved = job(id=2, runner_id=0, runner_name="")
        running = job(id=3, status="in_progress", conclusion=None, completed_at=None)
        both = cs.render(cs.report([starved, running]))
        self.assertIn("the starvation above is already decided", both)
        self.assertNotIn("the starvation above is already decided", cs.render(cs.report([running])))
        self.assertNotIn("the starvation above is already decided", cs.render(cs.report([starved])))


class GhApi(unittest.TestCase):
    def completed(self, code, out="", err=""):
        return unittest.mock.Mock(returncode=code, stdout=out, stderr=err)

    def test_returns_decoded_json(self):
        with unittest.mock.patch("subprocess.run", return_value=self.completed(0, '{"a": 1}')):
            self.assertEqual(cs.gh_api("repos/o/n"), {"a": 1})

    def test_failure_raises_runtime_error_with_stderr(self):
        with unittest.mock.patch("subprocess.run", return_value=self.completed(1, "", "bad token")) as run:
            with self.assertRaises(RuntimeError) as ctx:
                cs.gh_api("repos/o/n")
        self.assertIn("bad token", str(ctx.exception))
        self.assertFalse(run.call_args.kwargs.get("check"))
        self.assertTrue(run.call_args.kwargs.get("capture_output"))


def argparse_ns(**kwargs):
    return argparse.Namespace(**kwargs)


if __name__ == "__main__":
    unittest.main()
