#!/usr/bin/env python3
"""Unit tests for the local workflow runner."""
from __future__ import annotations

import io
import contextlib
import os
import textwrap
import unittest

import run_workflow_locally as runner
import yaml


def workflow(body: str) -> dict:
    return yaml.safe_load(textwrap.dedent(body))


class Collect(unittest.TestCase):
    def collect(self, body):
        return runner.collect(workflow(body))

    def test_run_steps_are_collected_in_file_order(self):
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: first
                    run: echo 1
                  - name: second
                    run: echo 2
        """)
        self.assertEqual([s.name for s in steps], ["first", "second"])

    def test_uses_steps_are_reported_not_silently_dropped(self):
        steps, skipped = self.collect("""
            jobs:
              a:
                steps:
                  - uses: actions/checkout@v4
                  - name: real
                    run: echo 1
        """)
        self.assertEqual(len(steps), 1)
        self.assertEqual(len(skipped), 1)
        self.assertIn("actions/checkout@v4", skipped[0])

    def test_working_directory_is_carried_from_the_step(self):
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: scoped
                    working-directory: portfolio/ledger
                    run: echo 1
        """)
        self.assertEqual(steps[0].workdir, "portfolio/ledger")

    def test_job_level_default_working_directory_applies(self):
        steps, _ = self.collect("""
            jobs:
              a:
                defaults:
                  run:
                    working-directory: gitops
                steps:
                  - name: inherits
                    run: echo 1
        """)
        self.assertEqual(steps[0].workdir, "gitops")

    def test_workflow_level_default_working_directory_applies(self):
        """Missing this ran every step one or more directories too high.
        `agent-permission-harness-ci.yml` sets it at the top level, and there
        `python3 harness.py` fails outright while `unittest discover` quietly
        collects a different set of tests and reports them green."""
        steps, _ = self.collect("""
            defaults:
              run:
                working-directory: portfolio/pipeline/probes
            jobs:
              a:
                steps:
                  - name: inherits
                    run: echo 1
        """)
        self.assertEqual(steps[0].workdir, "portfolio/pipeline/probes")

    def test_job_defaults_override_workflow_defaults(self):
        steps, _ = self.collect("""
            defaults:
              run:
                working-directory: top
            jobs:
              a:
                defaults:
                  run:
                    working-directory: job
                steps:
                  - name: s
                    run: echo 1
        """)
        self.assertEqual(steps[0].workdir, "job")

    def test_a_step_overrides_both(self):
        steps, _ = self.collect("""
            defaults:
              run:
                working-directory: top
            jobs:
              a:
                defaults:
                  run:
                    working-directory: job
                steps:
                  - name: s
                    working-directory: step
                    run: echo 1
        """)
        self.assertEqual(steps[0].workdir, "step")

    def test_expression_steps_are_skipped_rather_than_run_literally(self):
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: templated
                    run: echo ${{ github.sha }}
        """)
        self.assertEqual(steps[0].status, "skipped")
        self.assertIn("expression", steps[0].reason)

    def test_a_step_whose_env_needs_an_expression_is_skipped(self):
        """`portfolio-pages.yml`'s post-deploy check: the command is plain
        bash, but PAGE_URL comes from the deploy action's output, so locally
        it runs with the variable unset and dies on `set -u`. Reporting that
        as a failure would be reporting the absence of a deploy as a bug."""
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: post-deploy
                    env:
                      PAGE_URL: ${{ steps.deployment.outputs.page_url }}
                    run: curl -fsS "$PAGE_URL"
        """)
        self.assertEqual(steps[0].status, "skipped")

    def test_a_plain_env_block_does_not_skip_the_step(self):
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: ordinary
                    env:
                      LEVEL: quiet
                    run: echo 1
        """)
        self.assertEqual(steps[0].status, "pending")

    def test_multiline_run_blocks_are_collected(self):
        """The ad-hoc runs that missed a red `main` skipped these."""
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: block
                    run: |
                      echo one
                      echo two
        """)
        self.assertEqual(len(steps), 1)
        self.assertIn("echo two", steps[0].run)


class Screen(unittest.TestCase):
    def screened(self, command):
        return runner.screen(runner.Step("j", "n", command, "."))

    def test_a_read_only_command_passes(self):
        self.assertIsNone(self.screened("python3 -m pytest tests -q"))

    def test_git_push_is_refused(self):
        self.assertEqual(self.screened("git push origin main"), "git push")

    def test_branch_deletion_is_refused(self):
        self.assertIsNotNone(self.screened("git push origin --delete stale"))

    def test_infra_apply_is_refused(self):
        self.assertEqual(self.screened("tofu apply -auto-approve"), "infra apply")

    def test_a_github_api_write_is_refused(self):
        self.assertIsNotNone(self.screened("gh api repos/x/y -X DELETE"))

    def test_a_github_api_read_is_allowed(self):
        self.assertIsNone(self.screened("gh api repos/x/y/commits"))

    def test_a_refused_step_does_not_execute(self):
        step = runner.Step("j", "n", "git push origin main", ".")
        runner.execute(step, timeout=5)
        self.assertEqual(step.status, "refused")
        self.assertEqual(step.seconds, 0.0)


class Execute(unittest.TestCase):
    def run_one(self, command, workdir="."):
        step = runner.Step("j", "n", command, workdir)
        runner.execute(step, timeout=60)
        return step

    def test_a_passing_command_is_ok(self):
        self.assertEqual(self.run_one("true").status, "ok")

    def test_a_failing_command_is_failed_with_its_exit_code(self):
        step = self.run_one("exit 3")
        self.assertEqual(step.status, "failed")
        self.assertIn("exit 3", step.reason)

    def test_output_is_captured_for_the_report(self):
        step = self.run_one("echo diagnostic; exit 1")
        self.assertIn("diagnostic", step.tail)

    def test_a_missing_working_directory_fails_rather_than_runs_in_the_repo(self):
        step = self.run_one("true", workdir="no/such/dir")
        self.assertEqual(step.status, "failed")
        self.assertIn("does not exist", step.reason)

    def test_steps_run_under_bash_not_dash(self):
        """Actions runs Linux `run:` steps under bash and workflows here rely
        on it. Under /bin/sh `set -o pipefail` is a syntax error, and the tool
        would report a false failure on working code."""
        self.assertEqual(self.run_one("set -euo pipefail; true").status, "ok")

    def test_bash_only_syntax_does_not_read_as_a_repository_failure(self):
        self.assertEqual(self.run_one("[[ 1 == 1 ]]").status, "ok")

    def test_a_failing_dependency_install_is_setup_not_a_verdict(self):
        """A sandbox that already has the package, from another installer,
        must not read as the repository being broken."""
        step = self.run_one("pip install nothing-here-at-all-xyz 2>/dev/null; exit 1")
        self.assertEqual(step.status, "setup-failed")

    def test_a_failing_real_step_is_still_a_verdict(self):
        self.assertEqual(self.run_one("python3 -c 'raise SystemExit(1)'").status,
                         "failed")


class Report(unittest.TestCase):
    def report(self, steps, uses_skipped=(), forced=False):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = runner.report("w.yml", steps, list(uses_skipped), forced)
        return code, out.getvalue()

    def done(self, status, name="s"):
        step = runner.Step("j", name, "echo 1", ".")
        step.status = status
        return step

    def test_all_passing_is_exit_zero(self):
        code, out = self.report([self.done("ok")])
        self.assertEqual(code, 0)
        self.assertIn("1/1", out)

    def test_a_failure_is_exit_one(self):
        code, _ = self.report([self.done("ok"), self.done("failed")])
        self.assertEqual(code, 1)

    def test_running_nothing_is_not_a_pass(self):
        code, out = self.report([], uses_skipped=["a / b: uses: step"])
        self.assertEqual(code, 1)
        self.assertIn("nothing was verified", out.lower())

    def test_skipped_steps_are_named_and_the_report_says_it_is_not_green(self):
        code, out = self.report([self.done("ok"), self.done("skipped", "sk")])
        self.assertEqual(code, 0, "a skip is not a failure")
        self.assertIn("Not a green check", out)
        self.assertIn("sk", out)

    def test_setup_failure_does_not_fail_the_run_but_is_named(self):
        code, out = self.report([self.done("ok"), self.done("setup-failed", "deps")])
        self.assertEqual(code, 0)
        self.assertIn("SETUP", out)
        self.assertIn("deps", out)


class AgainstThisRepository(unittest.TestCase):
    def test_the_validate_workflow_parses_and_yields_steps(self):
        path = os.path.join(runner.WORKFLOWS, "portfolio-validate.yml")
        steps, _ = runner.collect(runner.load_workflow(path))
        self.assertGreater(len(steps), 20)

    def test_no_validate_step_trips_the_mutation_screen(self):
        """`Portfolio validate` is verification; if a step here ever starts
        pushing, this fails rather than the tool quietly refusing it."""
        path = os.path.join(runner.WORKFLOWS, "portfolio-validate.yml")
        steps, _ = runner.collect(runner.load_workflow(path))
        for step in steps:
            self.assertIsNone(runner.screen(step), f"{step.label} looks mutating")

    def test_branch_cleanup_is_not_on_the_verification_only_list(self):
        """It deletes branches. Running it locally must need --force."""
        self.assertNotIn("branch-cleanup.yml", runner.VERIFICATION_ONLY)

    def test_every_verification_only_workflow_exists(self):
        for name in runner.VERIFICATION_ONLY:
            self.assertTrue(os.path.isfile(os.path.join(runner.WORKFLOWS, name)),
                            f"{name} is listed but not in .github/workflows/")

    def test_an_unlisted_workflow_is_refused_without_force(self):
        self.assertEqual(runner.main(["branch-cleanup.yml"]), 2)

    def test_a_missing_workflow_is_reported(self):
        self.assertEqual(runner.main(["no-such-workflow.yml"]), 2)


if __name__ == "__main__":
    unittest.main()
