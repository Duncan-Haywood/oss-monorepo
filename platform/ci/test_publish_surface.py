#!/usr/bin/env python3
"""Tests for publish_surface.py.

The point of the tool is that removing a gate turns CI red, so most of these
assert on the boundary between `gated` and `live` rather than on the happy path.
"""

import unittest

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

    def test_no_workflow_publishes_on_a_merge_to_main(self):
        # The finding this tool exists to pin, and the premise CLAUDE.md's
        # agent-decidable test turns on. If this ever fails, a merge to main
        # can reach a live audience and that test has to be re-read.
        rows, _ = ps.survey()
        live = [r["workflow"] for r in rows if r["classification"] == "live"]
        self.assertEqual(live, [])


if __name__ == "__main__":
    unittest.main()
