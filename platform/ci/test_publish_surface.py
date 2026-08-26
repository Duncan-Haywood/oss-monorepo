#!/usr/bin/env python3
"""Tests for publish_surface.py.

The point of the tool is that removing a gate turns CI red, so most of these
assert on the boundary between `gated` and `live` rather than on the happy path.
"""

import contextlib
import io
import sys
import unittest
import unittest.mock

import yaml

import publish_surface as ps


def wf(text):
    return yaml.load(text, Loader=ps._StrictLoader)


class PushReachability(unittest.TestCase):
    def test_push_to_main_is_reachable(self):
        self.assertTrue(pushes(wf("on:\n  push:\n    branches: [main]\njobs: {}\n")))

    def test_push_with_no_branch_filter_matches_main(self):
        self.assertTrue(pushes(wf("on:\n  push:\n    paths: ['a/**']\njobs: {}\n")))

    def test_push_to_other_branches_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  push:\n    branches: [release]\njobs: {}\n")))

    def test_workflow_dispatch_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  workflow_dispatch:\njobs: {}\n")))

    def test_pull_request_only_is_not_reachable(self):
        self.assertFalse(pushes(wf("on:\n  pull_request:\njobs: {}\n")))

    def test_unquoted_on_resolving_to_true_is_still_read(self):
        # YAML 1.1 resolves a bare `on:` key to the boolean True. Every
        # workflow in this repo is written that way, so reading only the
        # string key would report the whole repo as unreachable.
        data = wf("on:\n  push:\n    branches: [main]\njobs: {}\n")
        self.assertNotIn("on", data)
        self.assertTrue(pushes(data))

    def test_bare_string_and_list_trigger_forms(self):
        self.assertTrue(pushes(wf("on: push\njobs: {}\n")))
        self.assertTrue(pushes(wf("on: [push, pull_request]\njobs: {}\n")))
        self.assertFalse(pushes(wf("on: [pull_request]\njobs: {}\n")))


def pushes(data):
    return ps.pushes_to_default_branch(data)


class Detection(unittest.TestCase):
    def test_publishing_action_matches_through_a_sha_pin(self):
        step = {"uses": "cloudflare/wrangler-action@9acf94ace14e7dc412b076f2c5c20b8ce93c79cd"}
        self.assertEqual(ps.publish_marker(step), "uses cloudflare/wrangler-action")

    def test_publishing_command_matches_inside_a_multiline_run(self):
        step = {"run": "set -e\nnpm ci\nnpm publish --access public\n"}
        self.assertEqual(ps.publish_marker(step), "runs 'npm publish'")

    def test_build_and_test_steps_are_not_publishing(self):
        for step in ({"run": "npm run build"}, {"run": "pytest -q"}, {"uses": "actions/checkout@v4"}):
            self.assertIsNone(ps.publish_marker(step))

    def test_uploading_a_pages_artifact_is_not_publishing(self):
        # upload-pages-artifact hands a tarball to the Actions artifact store;
        # actions/deploy-pages is what makes it public. Counting the upload
        # would mark retail-pilot-intel live on a run whose deploy job skipped.
        self.assertIsNone(ps.publish_marker({"uses": "actions/upload-pages-artifact@v3"}))


GATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    if: ${{ vars.PAGES_ENABLED == 'true' }}
    steps:
      - uses: actions/deploy-pages@v4
"""

UNGATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - uses: actions/deploy-pages@v4
"""

STEP_GATED = """
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - uses: cloudflare/wrangler-action@v3
        if: env.CLOUDFLARE_API_TOKEN != ''
"""

MIXED = """
on:
  push:
    branches: [main]
jobs:
  gated:
    if: ${{ vars.PAGES_ENABLED == 'true' }}
    steps:
      - uses: actions/deploy-pages@v4
  ungated:
    steps:
      - run: npm publish
"""


class Classification(unittest.TestCase):
    def test_job_level_gate_is_gated(self):
        self.assertEqual(ps.classify(wf(GATED))[0], "gated")

    def test_step_level_gate_is_gated(self):
        self.assertEqual(ps.classify(wf(STEP_GATED))[0], "gated")

    def test_removing_the_gate_flips_gated_to_live(self):
        self.assertEqual(ps.classify(wf(UNGATED))[0], "live")

    def test_one_ungated_publish_makes_the_whole_workflow_live(self):
        # The conservative direction: a workflow is only `gated` when *every*
        # publish step is behind an `if:`.
        self.assertEqual(ps.classify(wf(MIXED))[0], "live")

    def test_dispatch_only_publisher_is_not_live(self):
        data = wf("on:\n  workflow_dispatch:\njobs:\n  d:\n    steps:\n      - run: npm run deploy\n")
        self.assertEqual(ps.classify(data)[0], "dispatch")

    def test_workflow_with_no_publish_step_is_none(self):
        data = wf("on:\n  push:\n    branches: [main]\njobs:\n  t:\n    steps:\n      - run: pytest\n")
        self.assertEqual(ps.classify(data)[0], "none")

    def test_gates_are_recorded_so_changing_one_is_visible(self):
        steps = ps.classify(wf(GATED))[1]
        self.assertEqual(steps[0]["gates"], ["${{ vars.PAGES_ENABLED == 'true' }}"])


class DuplicateKeys(unittest.TestCase):
    def test_a_repeated_if_key_is_rejected_rather_than_silently_replaced(self):
        # PyYAML keeps the last of a repeated key, so a second `if:` would
        # replace the gate this tool reads without anything complaining.
        text = "on:\n  push:\njobs:\n  d:\n    if: false\n    if: true\n    steps: []\n"
        with self.assertRaises(ps.DuplicateKeyError):
            wf(text)


class SinglePagesDeployer(unittest.TestCase):
    """
    A guard that only ever passes proves nothing, so each case here builds the
    conflict it is meant to catch.
    """

    @staticmethod
    def row(name, gate, action="actions/deploy-pages"):
        step = {"job": "deploy", "step": f"uses {action}"}
        if gate is not None:
            step["gates"] = [gate]
        return {"workflow": name, "classification": "gated", "publishes": [step]}

    def test_two_workflows_behind_the_same_variable_conflict(self):
        # The incident: pages.yml and portfolio-pages.yml, same flip, one origin.
        rows = [
            self.row("a.yml", "github.event_name != 'pull_request' && vars.GITHUB_PAGES_ENABLED == 'true'"),
            self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])
        self.assertIn("a.yml", problems[0])
        self.assertIn("b.yml", problems[0])

    def test_different_variables_are_a_deliberate_either_or(self):
        # retail-pilot-intel is gated on its own variable precisely so the
        # portfolio flip does not publish it. That must stay legal.
        rows = [
            self.row("portfolio.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
            self.row("docs.yml", "${{ vars.RETAIL_PILOT_INTEL_PAGES == 'true' }}"),
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_a_single_deployer_is_fine_however_it_is_gated(self):
        self.assertEqual(ps.check_single_pages_deployer([self.row("only.yml", None)]), [])

    def test_an_ungated_deployer_alongside_another_is_flagged(self):
        rows = [self.row("open.yml", None), self.row("gated.yml", "${{ vars.X == 'true' }}")]
        problems = ps.check_single_pages_deployer(rows)
        self.assertTrue(any("no owner-set variable" in p for p in problems))

    def test_bracket_syntax_names_the_same_variable(self):
        rows = [
            self.row("a.yml", "${{ vars['GITHUB_PAGES_ENABLED'] == 'true' }}"),
            self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
        ]
        self.assertEqual(len(ps.check_single_pages_deployer(rows)), 1)

    def test_workflows_that_do_not_deploy_pages_are_ignored(self):
        rows = [
            {"workflow": "npm.yml", "classification": "gated",
             "publishes": [{"job": "p", "step": "runs 'npm publish'", "gates": ["${{ vars.G == 'true' }}"]}]},
            {"workflow": "quiet.yml", "classification": "none", "publishes": []},
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_a_pages_deploy_by_another_action_is_still_a_pages_deploy(self):
        # The hole this closes: the invariant matched only
        # `actions/deploy-pages`, so switching one of two racing workflows to
        # `peaceiris/actions-gh-pages` -- the same one Pages site, reached by a
        # different name, and already listed in PUBLISH_ACTIONS -- silently
        # brought the race back with nothing turning red.
        for action in ("peaceiris/actions-gh-pages", "JamesIves/github-pages-deploy-action"):
            with self.subTest(action=action):
                rows = [
                    self.row("a.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
                    self.row("b.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}", action=action),
                ]
                problems = ps.check_single_pages_deployer(rows)
                self.assertEqual(len(problems), 1)
                self.assertIn("GITHUB_PAGES_ENABLED", problems[0])

    def test_every_pages_action_the_surface_recognises_is_covered(self):
        # PAGES_DEPLOY_ACTIONS is a subset of PUBLISH_ACTIONS and has to stay
        # one: an action this tool already knows publishes to Pages, but the
        # invariant does not check, is exactly the blind spot above.
        for action in ps.PAGES_DEPLOY_ACTIONS:
            self.assertIn(action, ps.PUBLISH_ACTIONS, action)
        for action in ps.PUBLISH_ACTIONS:
            if "pages" in action.lower() or "gh-pages" in action.lower():
                self.assertIn(action, ps.PAGES_DEPLOY_ACTIONS, action)

    def test_a_shared_secret_arms_two_deployments_just_as_a_variable_does(self):
        # Reading only `vars.` called these ungated, which is the right verdict
        # for the wrong reason: the message then told the reader to add a gate
        # both workflows already had.
        rows = [
            self.row("a.yml", "${{ secrets.PAGES_TOKEN != '' }}"),
            self.row("b.yml", "${{ secrets.PAGES_TOKEN != '' }}"),
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("PAGES_TOKEN", problems[0])
        self.assertNotIn("no owner-set variable", problems[0])

    def test_a_secret_and_a_variable_are_still_distinct_switches(self):
        rows = [
            self.row("a.yml", "${{ vars.GITHUB_PAGES_ENABLED == 'true' }}"),
            self.row("b.yml", "${{ secrets.DOCS_PAGES_TOKEN != '' }}"),
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])


class Snapshot(unittest.TestCase):
    def test_committed_snapshot_matches_the_live_workflows(self):
        rows, errors = ps.survey()
        self.assertEqual(errors, [])
        self.assertEqual(ps.check(rows), [])

    def test_check_reports_a_classification_that_moved(self):
        rows, _ = ps.survey()
        tampered = [dict(r) for r in rows]
        tampered[0]["classification"] = "live"
        problems = ps.check(tampered)
        self.assertTrue(any("classification changed" in p for p in problems))

    def test_check_reports_an_unlisted_new_workflow(self):
        rows, _ = ps.survey()
        problems = ps.check(rows + [{"workflow": "new.yml", "classification": "live", "publishes": []}])
        self.assertTrue(any("new.yml" in p for p in problems))

    def test_one_variable_never_arms_two_pages_deployments(self):
        # The live invariant: GitHub serves one Pages site, so no single owner
        # flip may arm two workflows that replace it.
        rows, _ = ps.survey()
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_no_workflow_publishes_on_a_merge_to_main(self):
        # Pin: a merge to main currently reaches no live audience. If this
        # fails, a product merge also publishes. Still merge product PRs;
        # the live surface is now a fact to handle, not a reason to wait.
        rows, _ = ps.survey()
        live = [r["workflow"] for r in rows if r["classification"] == "live"]
        self.assertEqual(live, [])


if __name__ == "__main__":
    unittest.main()


class OneOriginPerGate(unittest.TestCase):
    """Cases carried over from #1776's `check_one_origin_per_gate`, which was a
    second implementation of the same invariant; the two were consolidated into
    `check_single_pages_deployer`. Kept because they cover shapes the other
    class does not: a gate naming two variables, and non-Pages publishers.

    GitHub serves one Pages site per repository, so two deployments behind one
    owner variable is a race, not redundancy.

    This is the shape of the 2026-08-26 near-miss: two sessions independently
    built "publish the portfolio to Pages", both reused `GITHUB_PAGES_ENABLED`
    so as not to open a second owner ask, and both merged. Individually valid,
    correctly snapshotted as gated, and invisible until the owner set the
    variable -- at which point the live site would have flapped between two
    different builds rather than failing outright.
    """

    @staticmethod
    def _pages_row(workflow, variable):
        return {
            "workflow": workflow,
            "classification": "gated",
            "publishes": [
                {
                    "job": "deploy",
                    "step": "uses actions/deploy-pages",
                    "gates": [f"github.event_name != 'pull_request' && vars.{variable} == 'true'"],
                }
            ],
        }

    def test_two_pages_deploys_on_one_variable_is_reported(self):
        problems = ps.check_single_pages_deployer([
            self._pages_row("pages.yml", "GITHUB_PAGES_ENABLED"),
            self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
        ])
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])
        self.assertIn("pages.yml", problems[0])
        self.assertIn("portfolio-pages.yml", problems[0])

    def test_separate_variables_are_fine(self):
        self.assertEqual(
            ps.check_single_pages_deployer([
                self._pages_row("pages.yml", "PAGES_PYTHON_BUILDER"),
                self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
            ]),
            [],
        )

    def test_one_workflow_on_one_variable_is_fine(self):
        self.assertEqual(
            ps.check_single_pages_deployer([self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED")]),
            [],
        )

    def test_a_gate_naming_two_variables_still_collides_on_the_shared_one(self):
        # `vars.A == 'true' && vars.B == 'true'` shares the origin with anything
        # gated on A alone: setting A and B fires both.
        rows = [
            self._pages_row("portfolio-pages.yml", "GITHUB_PAGES_ENABLED"),
            {
                "workflow": "other.yml",
                "classification": "gated",
                "publishes": [
                    {
                        "job": "deploy",
                        "step": "uses actions/deploy-pages",
                        "gates": ["vars.GITHUB_PAGES_ENABLED == 'true' && vars.EXTRA == 'true'"],
                    }
                ],
            },
        ]
        problems = ps.check_single_pages_deployer(rows)
        self.assertEqual(len(problems), 1)
        self.assertIn("GITHUB_PAGES_ENABLED", problems[0])

    def test_non_pages_publishers_do_not_collide(self):
        # Vercel and Cloudflare have their own destinations; two of them behind
        # one variable is not an origin race.
        rows = [
            {
                "workflow": "a.yml",
                "classification": "gated",
                "publishes": [
                    {"job": "d", "step": "uses amondnet/vercel-action", "gates": ["vars.SHARED == 'true'"]}
                ],
            },
            {
                "workflow": "b.yml",
                "classification": "gated",
                "publishes": [
                    {"job": "d", "step": "uses cloudflare/wrangler-action", "gates": ["vars.SHARED == 'true'"]}
                ],
            },
        ]
        self.assertEqual(ps.check_single_pages_deployer(rows), [])

    def test_write_cannot_bless_a_conflict(self):
        # The check used to sit inside main()'s `--check` branch, below an
        # early-returning `if args.write:` -- so `--write` never ran it, while
        # its own comment claimed re-running with --write must not be able to
        # bless a conflict. A conflicting surface has to fail whichever flag
        # asked, or the snapshot becomes the way to launder it.
        conflicting = [
            self._pages_row("a.yml", "GITHUB_PAGES_ENABLED"),
            self._pages_row("b.yml", "GITHUB_PAGES_ENABLED"),
        ]
        wrote = []
        with unittest.mock.patch.object(ps, "survey", return_value=(conflicting, [])), \
             unittest.mock.patch.object(ps, "write_snapshot", side_effect=lambda r: wrote.append(r)), \
             unittest.mock.patch.object(sys, "argv", ["publish_surface.py", "--write"]):
            err = io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                code = ps.main()

        self.assertEqual(code, 1, "--write must refuse a conflicting surface")
        self.assertEqual(wrote, [], "the snapshot must not be rewritten over a conflict")
        self.assertIn("GITHUB_PAGES_ENABLED", err.getvalue())

    def test_the_live_repository_has_at_most_one_pages_deploy_per_gate(self):
        # The check above proves the logic; this proves the repository.
        rows, errors = ps.survey()
        self.assertEqual(errors, [], 'every workflow must be readable for this to mean anything')
        self.assertEqual(ps.check_single_pages_deployer(rows), [])
