#!/usr/bin/env python3
"""Tests for pages_state.py.

The tool converts one API field into a verdict an owner may act on, so the
tests that matter are the ones pinning where the verdict must *not* go:

  - `has_pages: true` on a **public** repo says nothing about the plan, and
    reporting `likely-up` there would be inventing evidence;
  - `has_pages: false` is not evidence of a Free plan either, only of an
    unflipped switch, so it must stay `unknown` rather than becoming `down`;
  - a `gh-pages` branch built from a commit that is no longer the tip must
    read `stale`, because the failure this half exists to prevent is an owner
    flipping the switch and publishing a snapshot from last week.
"""

import io
import json
import unittest
import unittest.mock

import pages_state as ps


def fake_api(repo=None, branches=None, missing=(), workflows=None, workflows_fail=False):
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
        """A stale snapshot is a re-run away; it must not flip the verdict."""
        api = fake_api(
            branches={
                "gh-pages": branch(),
                "main": branch(sha="f" * 40, message="merge"),
            }
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
