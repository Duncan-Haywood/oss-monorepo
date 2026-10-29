#!/usr/bin/env python3
"""Tests for pages_state.py.

The tool converts one API field into a verdict an owner may act on, so the
tests that matter are the ones pinning where the verdict must *not* go:

  - `has_pages: true` on a **public** repo says nothing about the plan, and
    reporting `likely-up` there would be inventing evidence;
  - `has_pages: false` is not evidence of a Free plan either, only of an
    unflipped switch, so it must stay `unknown` rather than becoming `down`;
  - a `gh-pages` branch built from a commit that is no longer the tip must
    read `stale` **when a build input changed**, because the failure this half
    exists to prevent is an owner flipping the switch and publishing a snapshot
    from last week -- and must read `current` when nothing the site is built
    from moved, because a warning that fires after every docs merge is one the
    fleet learns to skim.
"""

import io
import json
import unittest
import unittest.mock

import pages_state as ps


def fake_api(repo=None, branches=None, missing=(), workflows=None, workflows_fail=False,
             runs=None, runs_fail=False, compare=None, compare_fail=False):
    """An api(path) callable over canned payloads.

    `missing` names branches that should raise the way `http_api_for` does on
    a 404, which is how the real tool learns a branch is absent.

    `workflows` is the list of workflow *paths* the Actions listing should
    return, paged the way GitHub pages it. Left as None it returns an empty
    listing, which `verdict_source` reads as "the managed namespace is not
    visible" and refuses to vote on -- the safe default for the tests written
    before the source half existed. `workflows_fail=True` raises instead,
    standing in for a token without `Actions: read`.
    """
    repo = {"private": True, "has_pages": True, "default_branch": "main", **(repo or {})}
    branches = branches or {}

    def call(path):
        if "/compare/" in path:
            if compare_fail:
                raise RuntimeError("GET .../compare failed: HTTP 404")
            return {"files": [{"filename": name} for name in (compare or [])]}
        if "/actions/runs" in path:
            if runs_fail:
                raise RuntimeError("GET .../actions/runs failed: HTTP 403")
            if runs is None:
                return repo
            return {"workflow_runs": runs}
        if "/actions/workflows" in path:
            if workflows_fail:
                raise RuntimeError("GET .../actions/workflows failed: HTTP 403")
            page = int(path.rsplit("page=", 1)[-1])
            chunk = (workflows or [])[(page - 1) * 100 : page * 100]
            return {"workflows": [{"path": p} for p in chunk]}
        if path.endswith("/branches/main") or "/branches/" in path:
            name = path.rsplit("/", 1)[-1]
            if name in missing:
                raise RuntimeError(f"GET .../branches/{name} failed: HTTP 404")
            if name not in branches:
                raise RuntimeError(f"GET .../branches/{name} failed: HTTP 404")
            return branches[name]
        return repo

    return call


# A listing that proves GitHub's managed namespace is visible without being a
# Pages builder -- the state this repository was measured in on 2026-09-05.
DYNAMIC_BUT_NOT_PAGES = [
    ".github/workflows/portfolio-validate.yml",
    "dynamic/dependabot/dependabot-updates",
    "dynamic/agents/copilot-pull-request-reviewer",
]


def branch(sha="a" * 40, message="Publish site built from " + "b" * 40, date=None):
    return {
        "commit": {
            "sha": sha,
            "commit": {
                "message": message,
                "committer": {"date": date or "2026-09-05T12:23:16Z"},
            },
        }
    }


class PlanVerdict(unittest.TestCase):
    def test_private_with_pages_is_likely_up(self):
        verdict, reason = ps.plan_verdict(
            {"private": True, "has_pages": True, "default_branch": "main"}
        )
        self.assertEqual(verdict, "likely-up")
        self.assertIn("Free plan does not permit", reason)

    def test_never_claims_up(self):
        """`up` would need billing or a 200; this tool has neither."""
        verdict, _ = ps.plan_verdict(
            {"private": True, "has_pages": True, "default_branch": "main"}
        )
        self.assertNotEqual(verdict, "up")

    def test_public_repo_carries_no_plan_evidence(self):
        verdict, reason = ps.plan_verdict(
            {"private": False, "has_pages": True, "default_branch": "main"}
        )
        self.assertEqual(verdict, "not-applicable")
        self.assertIn("any plan", reason)

    def test_no_pages_stays_unknown_not_down(self):
        """An unflipped switch and a Free plan look identical from here."""
        verdict, _ = ps.plan_verdict(
            {"private": True, "has_pages": False, "default_branch": "main"}
        )
        self.assertEqual(verdict, "unknown")


class Freshness(unittest.TestCase):
    def test_current_when_built_from_the_tip(self):
        state, reason = ps.freshness({"built_from": "c" * 40}, "c" * 40)
        self.assertEqual(state, "current")
        self.assertIn("cccccccc", reason)

    def test_short_sha_in_the_message_still_matches(self):
        """publish-branch.sh may record an abbreviated SHA; that is not stale."""
        state, _ = ps.freshness({"built_from": "c" * 12}, "c" * 40)
        self.assertEqual(state, "current")

    def test_stale_when_main_moved_on(self):
        state, reason = ps.freshness({"built_from": "d" * 40}, "e" * 40)
        self.assertEqual(state, "stale")
        self.assertIn("publish-branch.sh", reason)

    def test_absent_branch(self):
        state, reason = ps.freshness(None, "e" * 40)
        self.assertEqual(state, "absent")
        self.assertIn("nothing is staged", reason)

    def test_unreadable_message_is_unknown_not_current(self):
        state, _ = ps.freshness({"built_from": None}, "e" * 40)
        self.assertEqual(state, "unknown")


PATTERNS = ["ventures/**", "platform/pages/**", ".github/workflows/portfolio-pages.yml"]


class BuildInputs(unittest.TestCase):
    """The filter is parsed from the workflow, never restated here.

    A copied constant is the mistake CLAUDE.md records twice as having cost
    live product, so the test that matters is that the real file still parses
    and still names the subtrees the build reads.
    """

    def test_patterns_come_from_the_publishing_workflow(self):
        patterns = ps.build_input_patterns()
        self.assertIsNotNone(patterns)
        self.assertIn("ventures/**", patterns)
        self.assertIn("platform/pages/**", patterns)

    def test_unreadable_workflow_is_none_not_empty(self):
        """None and [] support opposite conclusions in `freshness`."""
        self.assertIsNone(ps.build_input_patterns("/nonexistent/publish.yml"))

    def test_subtree_glob_matches_nested_files(self):
        self.assertTrue(ps.is_build_input("ventures/a/site/index.html", PATTERNS))

    def test_a_sibling_directory_sharing_the_prefix_is_not_in_the_subtree(self):
        self.assertFalse(ps.is_build_input("ventures-notes/a.md", PATTERNS))
        self.assertFalse(ps.is_build_input("platform/pages-old/a.mjs", PATTERNS))

    def test_docs_are_not_build_inputs(self):
        for path in ("AGENTS.md", "portfolio/DIRECTION.md", "portfolio/ledger/2026-09.yaml"):
            self.assertFalse(ps.is_build_input(path, PATTERNS), path)

    def test_a_literal_path_matches_exactly(self):
        self.assertTrue(
            ps.is_build_input(".github/workflows/portfolio-pages.yml", PATTERNS)
        )
        self.assertFalse(ps.is_build_input(".github/workflows/other.yml", PATTERNS))

    def test_a_truncated_comparison_reads_as_unknown(self):
        """300 files is GitHub's cap, so the list may be incomplete.

        Returning the partial list would let a genuinely stale snapshot pass as
        current -- the one way this optimisation could cause the failure it
        exists to sharpen.
        """
        api = fake_api(compare=[f"ventures/v{i}/index.html" for i in range(300)])
        self.assertIsNone(ps.read_changed_paths(api, "a" * 40, "b" * 40))

    def test_a_missing_base_or_head_alone_is_none(self):
        api = fake_api(compare=["ventures/v1/index.html"])
        self.assertIsNone(ps.read_changed_paths(api, "", "b" * 40))
        self.assertIsNone(ps.read_changed_paths(api, "a" * 40, ""))

    def test_an_unreadable_comparison_is_none(self):
        api = fake_api(compare_fail=True)
        self.assertIsNone(ps.read_changed_paths(api, "a" * 40, "b" * 40))


class FreshnessAgainstBuildInputs(unittest.TestCase):
    """Measured 2026-09-06: `main` was one docs commit ahead of the snapshot and
    rebuilding produced a byte-identical tree (2053 files, zero diff). The old
    check called that `stale`."""

    def test_docs_only_drift_is_current(self):
        state, reason = ps.freshness(
            {"built_from": "d" * 40}, "e" * 40, ["AGENTS.md"], PATTERNS
        )
        self.assertEqual(state, "current")
        self.assertIn("same tree", reason)

    def test_a_changed_venture_is_still_stale(self):
        state, reason = ps.freshness(
            {"built_from": "d" * 40},
            "e" * 40,
            ["AGENTS.md", "ventures/foo/index.html"],
            PATTERNS,
        )
        self.assertEqual(state, "stale")
        self.assertIn("ventures/foo/index.html", reason)
        self.assertIn("publish-branch.sh", reason)

    def test_an_unreadable_comparison_keeps_saying_stale(self):
        """An absent measurement must never read as a healthy one."""
        state, _ = ps.freshness({"built_from": "d" * 40}, "e" * 40, None, PATTERNS)
        self.assertEqual(state, "stale")

    def test_an_unreadable_filter_keeps_saying_stale(self):
        state, _ = ps.freshness({"built_from": "d" * 40}, "e" * 40, ["AGENTS.md"], None)
        self.assertEqual(state, "stale")

    def test_collect_reports_current_for_a_docs_only_merge(self):
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="docs: tidy"),
            },
            compare=["AGENTS.md", "portfolio/DIRECTION.md"],
        )
        state = ps.collect(api)
        self.assertEqual(state["snapshot"], "current")

    def test_collect_still_reports_stale_when_a_venture_moved(self):
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="feat: new tool"),
            },
            compare=["ventures/new-tool/index.html"],
        )
        state = ps.collect(api)
        self.assertEqual(state["snapshot"], "stale")


class ReadPublishBranch(unittest.TestCase):
    def test_missing_branch_is_none_not_an_error(self):
        api = fake_api(missing=("gh-pages",))
        self.assertIsNone(ps.read_publish_branch(api))

    def test_parses_the_built_from_sha(self):
        api = fake_api(branches={"gh-pages": branch()})
        self.assertEqual(ps.read_publish_branch(api)["built_from"], "b" * 40)


class Collect(unittest.TestCase):
    def test_end_to_end_current_snapshot(self):
        head = "b" * 40
        api = fake_api(
            branches={"gh-pages": branch(), "main": branch(sha=head, message="merge")}
        )
        state = ps.collect(api)
        self.assertEqual(state["plan_verdict"], "likely-up")
        self.assertEqual(state["snapshot"], "current")
        self.assertEqual(ps.exit_code(state), 0)

    def test_exit_code_ignores_a_stale_snapshot(self):
        """A stale snapshot is a re-run away; it must not flip the verdict.

        The `compare` payload is what makes this snapshot genuinely stale
        rather than merely built from an older commit -- since 2026-09-06 those
        are different things, and only the first should read `stale`.
        """
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="merge"),
            },
            compare=["ventures/foo/index.html"],
        )
        state = ps.collect(api)
        self.assertEqual(state["snapshot"], "stale")
        self.assertEqual(ps.exit_code(state), 0)

    def test_no_pages_exits_one(self):
        api = fake_api(
            repo={"has_pages": False},
            branches={"main": branch(sha="f" * 40, message="merge")},
        )
        self.assertEqual(ps.exit_code(ps.collect(api)), 1)


class Cli(unittest.TestCase):
    def test_json_output_is_parseable(self):
        api = fake_api(
            branches={"gh-pages": branch(), "main": branch(sha="b" * 40, message="m")}
        )
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = ps.main(["--json"], api=api)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(buf.getvalue())["plan_verdict"], "likely-up")

    def test_text_output_names_the_flip_only_when_it_is_worth_taking(self):
        api = fake_api(
            repo={"has_pages": False},
            branches={"main": branch(sha="f" * 40, message="m")},
        )
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            ps.main([], api=api)
        self.assertNotIn("Settings -> Pages", buf.getvalue())


class SourceNote(unittest.TestCase):
    """`has_pages` answers a billing question and a routing one, and the tool
    used to give the billing answer to both.

    The routing half is the one with a cost: told "flip Pages on" when Pages is
    already on, an owner either finds nothing to change or changes the wrong
    thing, while the site may already be serving at a URL nobody has opened.
    """

    def test_an_already_configured_site_is_not_described_as_needing_enabling(self):
        note = ps.source_note({"has_pages": True, "private": True}, "https://x.test/r/")
        self.assertIn("ALREADY configured", note)
        # The actionable half: the URL that settles it without any credential.
        self.assertIn("https://x.test/r/", note)
        # Both outcomes are spelled out, so neither reading needs inventing.
        self.assertIn("serves", note)
        self.assertIn("404", note)

    def test_an_unconfigured_site_sends_the_owner_to_billing_not_to_the_switch(self):
        note = ps.source_note({"has_pages": False, "private": True}, "https://x.test/r/")
        self.assertIn("Billing", note)
        self.assertNotIn("Settings -> Pages", note)

    def test_a_missing_base_url_still_produces_a_usable_note(self):
        """`build.mjs` renaming its export must not make this crash or lie."""
        note = ps.source_note({"has_pages": True, "private": True}, None)
        self.assertIn("ALREADY configured", note)
        self.assertNotIn("None", note)

    def test_collect_carries_the_origin_read_from_build_mjs(self):
        api = fake_api(
            branches={"gh-pages": branch(), "main": branch(sha="b" * 40, message="m")}
        )
        state = ps.collect(api)
        self.assertTrue(state["pages_url"].startswith("https://"))
        self.assertIn("ALREADY configured", state["source_note"])


class VerdictSource(unittest.TestCase):
    """Which Pages source is configured, read from the Actions workflow listing.

    The vote is deliberately lopsided. `branch` reads a workflow that is
    *present*; `actions` reads an absence, and an absence has more ways of
    being uninformative than of being evidence. Every test below that expects
    `unknown` is pinning one of those ways, because the cost of getting this
    wrong is telling the owner to change a setting that is already correct --
    on the one route to a public catalogue that is not behind an outage.
    """

    CONFIGURED = {"has_pages": True, "private": True}

    def test_managed_builder_present_means_branch_source(self):
        verdict, reason = ps.verdict_source(
            self.CONFIGURED,
            {"sha": "a" * 40},
            DYNAMIC_BUT_NOT_PAGES + ["dynamic/pages/pages-build-deployment"],
        )
        self.assertEqual(verdict, "branch")
        self.assertIn("dynamic/pages/", reason)

    def test_matches_the_namespace_not_the_leaf_name(self):
        """GitHub has renamed this builder before; the namespace is the signal."""
        verdict, _ = ps.verdict_source(
            self.CONFIGURED,
            {"sha": "a" * 40},
            DYNAMIC_BUT_NOT_PAGES + ["dynamic/pages/some-future-builder"],
        )
        self.assertEqual(verdict, "branch")

    def test_absent_builder_with_a_built_branch_means_actions_source(self):
        verdict, reason = ps.verdict_source(
            self.CONFIGURED, {"sha": "a" * 40}, DYNAMIC_BUT_NOT_PAGES
        )
        self.assertEqual(verdict, "actions")
        self.assertIn("runner", reason)

    def test_unreadable_listing_is_unknown_not_actions(self):
        """A 403 is not evidence of anything. This is the failure that would
        otherwise send an owner to change a correct setting."""
        verdict, reason = ps.verdict_source(self.CONFIGURED, {"sha": "a" * 40}, None)
        self.assertEqual(verdict, "unknown")
        self.assertIn("could not be read", reason)

    def test_a_listing_with_no_managed_workflows_at_all_is_unknown(self):
        """If GitHub is not showing `dynamic/` entries to this token, then a
        missing `dynamic/pages/` entry says nothing about Pages."""
        verdict, reason = ps.verdict_source(
            self.CONFIGURED, {"sha": "a" * 40}, [".github/workflows/ci.yml"]
        )
        self.assertEqual(verdict, "unknown")
        self.assertIn("not showing", reason)

    def test_no_publish_branch_is_unknown_because_nothing_would_have_built(self):
        """A branch source pointed at a branch that never took a push builds
        nothing, so the builder's absence is expected rather than telling."""
        verdict, reason = ps.verdict_source(
            self.CONFIGURED, None, DYNAMIC_BUT_NOT_PAGES
        )
        self.assertEqual(verdict, "unknown")
        self.assertIn("proves nothing", reason)

    def test_no_pages_site_has_no_source(self):
        verdict, _ = ps.verdict_source(
            {"has_pages": False, "private": True}, {"sha": "a" * 40}, []
        )
        self.assertEqual(verdict, "unknown")


class ReadWorkflowPaths(unittest.TestCase):
    def test_pages_past_the_first_hundred(self):
        """This repository has 232 workflows and the `dynamic/` entries sort
        wherever GitHub puts them, so a single-page read can miss the vote."""
        many = [f".github/workflows/w{i}.yml" for i in range(150)]
        many.append("dynamic/pages/pages-build-deployment")
        paths = ps.read_workflow_paths(fake_api(workflows=many))
        self.assertEqual(len(paths), 151)
        self.assertIn("dynamic/pages/pages-build-deployment", paths)

    def test_an_unreadable_listing_is_none_not_empty(self):
        """None and [] support opposite conclusions downstream; a tool that
        collapses them starts asserting things it did not measure."""
        self.assertIsNone(ps.read_workflow_paths(fake_api(workflows_fail=True)))

    def test_an_empty_listing_is_empty_not_none(self):
        self.assertEqual(ps.read_workflow_paths(fake_api(workflows=[])), [])


class SourceNoteFromVerdict(unittest.TestCase):
    """The note is the only part an owner reads, so the verdict has to reach it."""

    def test_actions_source_names_the_flip_and_the_branch(self):
        note = ps.source_note(
            {"has_pages": True, "private": True}, "https://x.test/r/", "actions", "why"
        )
        self.assertIn("Settings -> Pages", note)
        self.assertIn("gh-pages", note)
        self.assertIn("https://x.test/r/", note)
        # It must not still be telling the owner to go and find out which
        # source is configured -- that is the question this verdict answered.
        self.assertNotIn("What is unread", note)

    def test_branch_source_does_not_ask_for_a_flip_already_granted(self):
        note = ps.source_note(
            {"has_pages": True, "private": True}, "https://x.test/r/", "branch", "why"
        )
        self.assertIn("already granted", note)
        self.assertNotIn("Settings -> Pages -> Source", note)

    def test_unknown_falls_back_to_the_url_that_settles_it(self):
        note = ps.source_note(
            {"has_pages": True, "private": True}, "https://x.test/r/", "unknown", "why"
        )
        self.assertIn("ALREADY configured", note)
        self.assertIn("https://x.test/r/", note)

    def test_collect_reports_the_source_it_measured(self):
        api = fake_api(
            branches={"gh-pages": branch(), "main": branch(sha="b" * 40, message="m")},
            workflows=DYNAMIC_BUT_NOT_PAGES,
        )
        state = ps.collect(api)
        self.assertEqual(state["source"], "actions")
        self.assertIn("Settings -> Pages", state["source_note"])

    def test_render_shows_the_source_row(self):
        api = fake_api(
            branches={"gh-pages": branch(), "main": branch(sha="b" * 40, message="m")},
            workflows=DYNAMIC_BUT_NOT_PAGES,
        )
        text = ps.render(ps.collect(api))
        self.assertIn("source            actions", text)


if __name__ == "__main__":
    unittest.main()


def pages_run(conclusion="success", sha="e" * 40, branch_name="gh-pages",
              status="completed", path="dynamic/pages/pages-build-deployment",
              run_id=34012041708):
    return {
        "path": path,
        "status": status,
        "conclusion": conclusion,
        "head_branch": branch_name,
        "head_sha": sha,
        "id": run_id,
        "updated_at": "2026-09-06T04:39:47Z",
    }


class DeploymentVote(unittest.TestCase):
    """The vote that separates "configured" from "actually deployed".

    `verdict_source` reads whether GitHub *lists* a branch builder. That
    establishes some branch source exists but names no branch and proves no
    build ever ran, and this repository spent days reading it as though it
    meant the site was up. A managed Pages build is triggered only by a push
    to the configured source, so a *successful run of it on gh-pages* names
    the branch and shows a real deployment.
    """

    def test_a_successful_managed_run_means_served(self):
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[pages_run()])), None
        )
        self.assertEqual(got, "served")
        self.assertIn("gh-pages", why)
        self.assertIn("already granted", why)

    def test_the_reading_is_json_serialisable_on_a_healthy_repository(self):
        """`--json` died with `Circular reference detected` on every good repo.

        When the newest *completed* build is itself the successful one,
        `latest` and `last_success` are the same summary object, so attaching
        one to the other made the dict reference itself. Nothing that reads a
        field off it noticed -- `verdict_deployment` only ever reads summary
        keys -- so the only caller that walks the whole structure was the one
        that broke, and it broke exactly when the site was fine. A repo whose
        newest build had *failed* serialised correctly, which is the inversion
        that let it read as "nobody uses --json".
        """
        deployment = ps.read_pages_deployment(fake_api(runs=[pages_run()]))
        self.assertIsNot(deployment["last_success"], deployment)
        json.dumps(deployment)  # would raise ValueError before the fix
        # The copy still carries the fields `verdict_deployment` reads.
        self.assertEqual(deployment["last_success"]["run_id"], deployment["run_id"])
        self.assertEqual(deployment["last_success"]["conclusion"], "success")

    def test_a_failed_build_is_not_served_but_still_names_the_source(self):
        """A failed deploy still proves the branch is the source.

        Those are different facts and collapsing them would either hide a
        broken deploy or re-raise an owner ask that is already granted.
        """
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[pages_run(conclusion="failure")])),
            None,
        )
        self.assertEqual(got, "failed")
        self.assertIn("did not deploy", why)

    def test_no_runs_is_unknown_not_served(self):
        got, _ = ps.verdict_deployment(ps.read_pages_deployment(fake_api()), None)
        self.assertEqual(got, "unknown")

    def test_an_unreadable_listing_is_unknown_not_served(self):
        got, _ = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs_fail=True)), None
        )
        self.assertEqual(got, "unknown")

    def test_a_repository_workflow_on_the_branch_is_not_a_pages_build(self):
        """The namespace is the whole signal.

        `publish-pages-branch.yml` is a repository workflow that also runs on
        pushes to this branch. Counting it would report `served` on a
        repository where Pages was never enabled at all.
        """
        deployment = ps.read_pages_deployment(
            fake_api(runs=[pages_run(path=".github/workflows/publish-pages-branch.yml")])
        )
        self.assertIsNone(deployment)

    def test_an_in_progress_run_is_skipped_for_the_last_completed_one(self):
        deployment = ps.read_pages_deployment(fake_api(runs=[
            pages_run(status="in_progress", conclusion=None, sha="f" * 40),
            pages_run(sha="a" * 40),
        ]))
        self.assertEqual(deployment["head_sha"], "aaaaaaaa")

    def test_a_superseded_build_is_not_a_failure(self):
        """`cancelled` is GitHub abandoning a build a newer push overtook.

        The check used to be `conclusion != "success"`, which reported
        `failed` -- "this snapshot did not deploy" -- about a site that was
        serving. Of runs 111-125 on this branch five concluded `cancelled` and
        each was followed by a `success`, so this is the ordinary outcome of
        two sessions publishing minutes apart, not an edge case.
        """
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[
                pages_run(conclusion="cancelled", sha="f" * 40, run_id=124),
                pages_run(conclusion="success", sha="a" * 40, run_id=123),
            ])),
            None,
        )
        self.assertEqual(got, "served")
        # It must name the build that actually deployed, not the abandoned one.
        self.assertIn("123", why)
        self.assertIn("aaaaaaaa", why)
        self.assertNotIn("did not deploy", why)

    def test_the_measured_false_alarm_does_not_recur(self):
        """A replay of the 03:21 reading on 2026-09-07.

        The real build (run 125) was still in progress, so the reader fell
        through it onto run 124 -- `cancelled`, superseded 11 seconds earlier
        -- and the row read `failed`. The same command on the same commit read
        `served` at 03:22. `publish-branch.sh` prints this report immediately
        after force-pushing the branch, so that window is not incidental: it
        is exactly when a publishing session looks.
        """
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[
                pages_run(status="in_progress", conclusion=None,
                          sha="d" * 40, run_id=34079370768),
                pages_run(conclusion="cancelled",
                          sha="2" * 40, run_id=34079362071),
                pages_run(conclusion="success",
                          sha="3" * 40, run_id=34079332192),
            ])),
            None,
        )
        self.assertEqual(got, "served")
        self.assertIn("in flight", why)
        self.assertIn("34079370768", why)

    def test_a_cancelled_build_with_no_success_behind_it_is_not_served(self):
        """Superseded is not a failure, but it is not evidence of a deploy.

        Reading it as `served` would be the mirror of the bug being fixed --
        trading a false alarm for a false all-clear.
        """
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[
                pages_run(conclusion="cancelled", sha="f" * 40, run_id=124),
            ])),
            None,
        )
        self.assertEqual(got, "unknown")
        self.assertNotIn("already granted", why)

    def test_a_genuine_failure_is_still_failed(self):
        """The point is to keep this signal believable, not to soften it."""
        for conclusion in ("failure", "timed_out", "startup_failure"):
            with self.subTest(conclusion=conclusion):
                got, why = ps.verdict_deployment(
                    ps.read_pages_deployment(
                        fake_api(runs=[pages_run(conclusion=conclusion)])
                    ),
                    None,
                )
                self.assertEqual(got, "failed")
                self.assertIn("did not deploy", why)

    def test_an_in_flight_build_is_disclosed_alongside_a_success(self):
        """Answering about an older commit silently is its own defect."""
        got, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[
                pages_run(status="in_progress", conclusion=None,
                          sha="f" * 40, run_id=999),
                pages_run(conclusion="success", sha="a" * 40, run_id=123),
            ])),
            None,
        )
        self.assertEqual(got, "served")
        self.assertIn("in flight", why)
        self.assertIn("999", why)

    def test_a_first_ever_build_still_running_is_unknown_not_served(self):
        got, _ = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[
                pages_run(status="in_progress", conclusion=None, sha="f" * 40),
            ])),
            None,
        )
        self.assertEqual(got, "unknown")

    def test_a_snapshot_pushed_after_the_last_build_is_flagged(self):
        """Served, but not necessarily *this* snapshot -- worth saying."""
        _, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[pages_run(sha="e" * 40)])),
            {"sha": "9" * 40},
        )
        self.assertIn("has since moved", why)

    def test_a_snapshot_that_is_the_built_commit_is_not_flagged(self):
        """The prefix compared is the one `head_sha` carries, no longer."""
        _, why = ps.verdict_deployment(
            ps.read_pages_deployment(fake_api(runs=[pages_run(sha="e" * 40)])),
            {"sha": "e" * 40},
        )
        self.assertNotIn("has since moved", why)

    def test_the_reading_reaches_the_rendered_report(self):
        api = fake_api(
            branches={"main": branch(sha="c" * 40), "gh-pages": branch()},
            workflows=DYNAMIC_BUT_NOT_PAGES + ["dynamic/pages/pages-build-deployment"],
            runs=[pages_run()],
        )
        out = ps.render(ps.collect(api))
        self.assertIn("deployed", out)
        self.assertIn("served", out)


class RequireCurrent(unittest.TestCase):
    """The `--require-current` gate.

    Its whole reason to exist is that a stale snapshot had no failure mode:
    `main` moves, `gh-pages` does not, and the live site falls behind with no
    error anywhere. Every assertion below is about that gate being loud, being
    separate from the route-viability verdict, and never publishing anything.
    """

    def test_current_snapshot_passes(self):
        self.assertEqual(ps.freshness_exit_code({"snapshot": "current"}), 0)

    def test_stale_snapshot_fails(self):
        self.assertEqual(ps.freshness_exit_code({"snapshot": "stale"}), 1)

    def test_unreadable_states_fail_rather_than_pass(self):
        """`absent` and `unknown` are not `current`, and must not read as it.

        This is the direction the whole module already refuses to fail in: an
        unreadable comparison is never licence to call a snapshot fresh.
        """
        for verdict in ("absent", "unknown"):
            with self.subTest(verdict=verdict):
                self.assertEqual(ps.freshness_exit_code({"snapshot": verdict}), 1)

    def test_gate_is_independent_of_the_route_verdict(self):
        """A viable route with a stale snapshot must still fail the gate.

        `exit_code` says the route is worth having; this says the site is
        up to date. Folding them together is what the `exit_code` docstring
        declines to do, so pin that they can disagree.
        """
        state = {"plan_verdict": "likely-up", "snapshot": "stale"}
        self.assertEqual(ps.exit_code(state), 0)
        self.assertEqual(ps.freshness_exit_code(state), 1)

    def _run(self, changed):
        """End to end through `main`, with `changed` the files `main` moved.

        Built the same way as the `collect` tests above: a venture file makes
        the snapshot stale, a docs file leaves it current.
        """
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="a merge"),
            },
            compare=changed,
        )
        err = io.StringIO()
        with unittest.mock.patch("sys.stdout", new=io.StringIO()) as out:
            with unittest.mock.patch("sys.stderr", new=err):
                code = ps.main(["--require-current"], api=api)
        return code, out.getvalue(), err.getvalue()

    def test_stale_run_names_the_command_that_fixes_it(self):
        """A failure that does not say what to do gets re-diagnosed next run."""
        code, _, err = self._run(["ventures/new-tool/index.html"])
        self.assertEqual(code, 1)
        self.assertIn("FAIL", err)
        self.assertIn("publish-branch.sh", err)
        self.assertIn("CONFIRM=publish-pages-branch", err)

    def test_a_docs_only_merge_passes_the_gate(self):
        """The gate must not cry wolf: a merge that changes no build input
        rebuilds byte-identically, so it is not a reason to republish."""
        code, _, err = self._run(["AGENTS.md", "portfolio/DIRECTION.md"])
        self.assertEqual(code, 0)
        self.assertEqual(err, "")

    def test_the_report_is_still_printed_when_the_gate_fails(self):
        """The gate adds a verdict; it must not swallow the reading."""
        _, out, _ = self._run(["ventures/new-tool/index.html"])
        self.assertIn("snapshot", out)

    def test_the_gate_never_publishes(self):
        """A check that rewrote a branch as a side effect would be a footgun."""
        with unittest.mock.patch("subprocess.run") as ran:
            self._run(["ventures/new-tool/index.html"])
        ran.assert_not_called()

    def test_without_the_flag_a_stale_snapshot_still_exits_zero(self):
        """The pre-existing contract is unchanged; the gate is opt-in."""
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="a merge"),
            },
            compare=["ventures/new-tool/index.html"],
        )
        with unittest.mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(ps.main([], api=api), 0)


class IndexingVerdict(unittest.TestCase):
    """Can a crawler discover this site's sitemap on its own?

    `robots.txt` is fetched per origin, at the origin root. A project Pages
    site is served from a subpath, so the file this repository publishes is
    not the file a crawler reads -- and nothing in the tree said so, which is
    why this row exists rather than a paragraph somewhere.
    """

    def test_a_subpath_site_names_the_file_crawlers_actually_read(self):
        verdict, why = ps.indexing_verdict("https://duncan-haywood.github.io/oss-monorepo/")
        self.assertEqual(verdict, "subpath-robots")
        self.assertIn("https://duncan-haywood.github.io/robots.txt", why)
        self.assertIn("oss-monorepo/robots.txt", why)

    def test_a_subpath_site_names_all_three_owner_fixes(self):
        _, why = ps.indexing_verdict("https://duncan-haywood.github.io/oss-monorepo/")
        self.assertIn("Search Console", why)
        self.assertIn("custom domain", why)
        # The host-root robots.txt route, added 2026-09-17. It is the cheapest
        # of the three and was missing entirely, so the report offered only the
        # two expensive ones while 1143 published pages stayed unenumerable.
        self.assertIn("https://duncan-haywood.github.io/robots.txt", why)
        self.assertIn("Sitemap: https://duncan-haywood.github.io/oss-monorepo/sitemap.xml", why)

    def test_the_cheapest_fix_is_offered_before_the_expensive_ones(self):
        """Order is the whole point of naming a third option.

        An owner reads the first thing offered. Search Console is per-engine
        and manual; a custom domain costs money and a DNS round trip. The
        host-root robots.txt is two lines and reaches every crawler, so a
        report that buried it would have been no better than not adding it.
        """
        _, why = ps.indexing_verdict("https://duncan-haywood.github.io/oss-monorepo/")
        self.assertLess(why.index("robots.txt -- a repository named"), why.index("Search Console"))
        self.assertLess(why.index("Search Console"), why.index("custom domain"))

    def test_the_robots_route_warns_about_an_existing_user_site(self):
        """Creating vs. editing is the one way this advice can destroy value.

        If the user Pages site already exists, its robots.txt is live and may
        already Disallow. Telling the owner to 'create' one would either fail
        or replace a file governing something else.
        """
        _, why = ps.indexing_verdict("https://duncan-haywood.github.io/oss-monorepo/")
        self.assertIn("already exists", why)
        self.assertIn("Disallow", why)

    def test_a_subpath_site_says_crawling_is_still_allowed(self):
        """The row must not read as 'the site is blocked from search'."""
        _, why = ps.indexing_verdict("https://duncan-haywood.github.io/oss-monorepo/")
        self.assertIn("Crawling is still allowed", why)

    def test_an_origin_root_site_is_fine_and_says_so(self):
        for base in ("https://marisstella.dev/", "https://marisstella.dev"):
            verdict, why = ps.indexing_verdict(base)
            self.assertEqual(verdict, "root", base)
            self.assertIn("discoverable", why)

    def test_an_unreadable_base_url_is_unknown_never_root(self):
        """Absence reads as unknown, never as health -- the house rule."""
        for base in ("", None):
            verdict, _ = ps.indexing_verdict(base)
            self.assertEqual(verdict, "unknown", repr(base))

    def test_the_row_reaches_the_rendered_report(self):
        state = {
            "private": True, "has_pages": True,
            "plan_verdict": "likely-up", "plan_reason": "r",
            "source": "branch", "source_reason": "r",
            "deployed": "served", "deployed_reason": "r",
            "snapshot": "current", "snapshot_reason": "r",
            "indexing": "subpath-robots", "indexing_reason": "why " * 40,
            "source_note": "n",
        }
        out = ps.render(state)
        self.assertIn("indexing          subpath-robots", out)
        # Wrapped rather than one long line: an unwrapped paragraph runs off a
        # terminal and is skipped by the reader this row exists for.
        self.assertTrue(all(len(line) <= 100 for line in out.split("\n")), out)
        # The paragraph wraps at 76 columns: a 77-character reason must break,
        # so a row never passes 96 characters with its 20-column gutter.
        state["indexing_reason"] = "a" * 38 + " " + "b" * 38
        rows = [l for l in ps.render(state).split("\n") if l.strip(" ").startswith(("a", "b"))]
        self.assertEqual(len(rows), 2, rows)

    def test_it_does_not_change_the_exit_code(self):
        """A subpath robots.txt is an owner action, not a broken route -- and
        folding it into the exit code would make a green run mean two things,
        the same reason freshness has its own gate."""
        for verdict in ("root", "subpath-robots", "unknown"):
            self.assertEqual(ps.exit_code({"plan_verdict": "likely-up", "indexing": verdict}), 0)


SAMPLE_ROW = '''# a leading comment the writer cares about
readings:

  github-actions-runners:
    verdict: down
    measured: "2026-09-01"
    run: 1
    how: >-
      unrelated row, must not be touched

  github-pages-branch-route:
    verdict: down
    measured: "2026-01-01"
    run: 11111
    how: >-
      prose that carries the lesson and must survive a record
    note: >-
      a second prose field, also load-bearing

  k3s-cluster:
    verdict: down
    measured: "2026-09-04"
    run: 2
'''


def served_state(run_id=99, deployed="served"):
    return {
        "deployed": deployed,
        "deployment": {"last_success": {"run_id": run_id}},
    }


class RecordReading(unittest.TestCase):
    """`--record` writes the measured fields back into infra_state.yaml.

    The reason this is code rather than a reminder is in `ORIGIN_READING`'s
    comment: `decision_queue.py` ages this row out after three days and then
    prints "OUTAGE: the public surface is down" about a catalogue GitHub is
    measurably serving. The tests below pin the two halves that make the
    automation safe to trust -- it must not overwrite a real reading with a
    non-reading, and it must not eat the prose.
    """

    def setUp(self):
        import tempfile, os
        fd, self.path = tempfile.mkstemp(suffix=".yaml")
        os.close(fd)
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write(SAMPLE_ROW)

    def tearDown(self):
        import os
        os.unlink(self.path)

    def body(self):
        with open(self.path, encoding="utf-8") as fh:
            return fh.read()

    def test_it_writes_verdict_measured_and_run(self):
        import datetime as dt
        changed, msg = ps.record_reading(
            served_state(run_id=35156548733), self.path, today=dt.date(2026, 9, 16)
        )
        self.assertTrue(changed, msg)
        body = self.body()
        self.assertIn('    verdict: up\n', body)
        self.assertIn('    measured: "2026-09-16"\n', body)
        self.assertIn("    run: 35156548733\n", body)

    def test_it_preserves_every_comment_and_prose_field(self):
        """A `yaml.safe_load`/`yaml.dump` round-trip would delete all of this.

        `infra_state.yaml` is roughly nine parts dated lesson to one part data,
        so silently dropping the prose would cost far more than the stale row
        this function exists to fix.
        """
        ps.record_reading(served_state(), self.path)
        body = self.body()
        self.assertIn("# a leading comment the writer cares about", body)
        self.assertIn("prose that carries the lesson and must survive a record", body)
        self.assertIn("a second prose field, also load-bearing", body)

    def test_a_row_directly_after_a_neighbour_leaves_the_neighbour_alone(self):
        """No blank line between rows: the line above the key is not its block."""
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write(
                "readings:\n"
                "  other-row:\n"
                "    verdict: down\n"
                f"  {ps.ORIGIN_READING}:\n"
                "    verdict: down\n"
                '    measured: "2026-01-01"\n'
                "    run: 1\n"
            )
        ps.record_reading(served_state(), self.path)
        head, _, _ = self.body().partition(f"  {ps.ORIGIN_READING}:")
        self.assertEqual(head, "readings:\n  other-row:\n    verdict: down\n")

    def test_it_touches_no_other_row(self):
        """The block ends at the next key at the row's own indent."""
        ps.record_reading(served_state(), self.path)
        body = self.body()
        self.assertIn('    measured: "2026-09-01"\n', body)  # github-actions-runners
        self.assertIn('    measured: "2026-09-04"\n', body)  # k3s-cluster
        self.assertIn("      unrelated row, must not be touched", body)

    def test_a_failed_build_records_down(self):
        changed, _ = ps.record_reading(served_state(deployed="failed"), self.path)
        self.assertTrue(changed)
        self.assertIn("    verdict: down\n", self.body())

    def test_an_unknown_reading_refuses_and_changes_nothing(self):
        """The direction the 2026-08-30..09-04 episode failed in.

        `unknown` measured nothing about whether the origin serves, so writing
        it would replace a real reading (and its run id) with a non-reading.
        Letting the existing row age out on its own is the honest outcome.
        """
        before = self.body()
        changed, msg = ps.record_reading(served_state(deployed="unknown"), self.path)
        self.assertFalse(changed)
        self.assertIn("age out", msg)
        self.assertEqual(before, self.body())

    def test_a_verdict_without_a_run_id_refuses(self):
        """`infra_state.yaml`'s own rule: do not edit a verdict without one."""
        before = self.body()
        changed, msg = ps.record_reading(
            {"deployed": "served", "deployment": {}}, self.path
        )
        self.assertFalse(changed)
        self.assertIn("run id", msg)
        self.assertEqual(before, self.body())

    def test_a_missing_row_refuses_rather_than_appending(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write("readings:\n\n  k3s-cluster:\n    verdict: down\n")
        changed, msg = ps.record_reading(served_state(), self.path)
        self.assertFalse(changed)
        self.assertIn(ps.ORIGIN_READING, msg)

    def test_the_real_file_still_carries_the_row_it_edits(self):
        """Guards the constant against a rename in infra_state.yaml.

        A recorder that silently refuses forever is the same shape as a guard
        nobody runs, which is the defect CLAUDE.md records most often.
        """
        with open(ps.INFRA_STATE, encoding="utf-8") as fh:
            self.assertIn(f"  {ps.ORIGIN_READING}:\n", fh.read())
