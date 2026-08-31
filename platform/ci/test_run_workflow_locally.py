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

    def test_an_unset_repository_variable_resolves_to_empty_rather_than_skipping(self):
        """`portfolio-pages.yml`'s "Build the site": the command is plain, and
        `PAGES_BASE_URL: ${{ vars.PAGES_BASE_URL }}` is an optional override
        that `build.mjs` reads as `process.env.X || DEFAULT_BASE_URL`. Skipping
        it did not just lose one step -- "Check the built artifact" then ran
        against a `dist` nothing had created and was reported FAIL, so the
        deploy-critical workflow read red while it was green."""
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: build
                    env:
                      PAGES_BASE_URL: ${{ vars.PAGES_BASE_URL }}
                    run: node build.mjs --out=dist
        """)
        self.assertEqual(steps[0].status, "pending")
        self.assertEqual(steps[0].env, {"PAGES_BASE_URL": ""})
        self.assertEqual(steps[0].unset_vars, ["PAGES_BASE_URL"])

    def test_a_secret_in_env_still_skips(self):
        """Blanking a secret would run the step without the credential it
        exists to use, which is a confusing failure, not a verification."""
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: publish
                    env:
                      TOKEN: ${{ secrets.NPM_TOKEN }}
                    run: echo hi
        """)
        self.assertEqual(steps[0].status, "skipped")

    def test_a_vars_expression_in_the_command_still_skips(self):
        """Only `env:` is resolved. A `vars.` reference inline in the command
        would have to be substituted into shell text, which is the literal-text
        hazard the skip exists for."""
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: inline
                    run: echo ${{ vars.CI_RUNNER }}
        """)
        self.assertEqual(steps[0].status, "skipped")

    def test_a_partially_templated_env_value_keeps_its_literal_half(self):
        steps, _ = self.collect("""
            jobs:
              a:
                steps:
                  - name: mixed
                    env:
                      BASE: https://${{ vars.HOST }}/tools
                    run: echo 1
        """)
        self.assertEqual(steps[0].status, "pending")
        self.assertEqual(steps[0].env, {"BASE": "https:///tools"})

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

    def test_a_resolved_variable_reaches_the_step_as_empty(self):
        step = runner.Step("j", "n", 'test -z "${BASE_URL-unset}"', ".")
        step.env = {"BASE_URL": ""}
        runner.execute(step, timeout=60)
        self.assertEqual(step.status, "ok", step.tail)

    def test_a_resolved_variable_beats_one_already_in_the_environment(self):
        """The point is to reproduce CI's unset state. A developer's stray
        export would otherwise verify a configuration CI does not have."""
        os.environ["PF_TEST_STRAY"] = "leaked"
        self.addCleanup(os.environ.pop, "PF_TEST_STRAY", None)
        step = runner.Step("j", "n", 'test -z "$PF_TEST_STRAY"', ".")
        step.env = {"PF_TEST_STRAY": ""}
        runner.execute(step, timeout=60)
        self.assertEqual(step.status, "ok", step.tail)

    def test_the_rest_of_the_environment_survives_a_resolved_variable(self):
        os.environ["PF_TEST_KEEP"] = "kept"
        self.addCleanup(os.environ.pop, "PF_TEST_KEEP", None)
        step = runner.Step("j", "n", 'test "$PF_TEST_KEEP" = kept', ".")
        step.env = {"OTHER": ""}
        runner.execute(step, timeout=60)
        self.assertEqual(step.status, "ok", step.tail)

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


class GlobToRegex(unittest.TestCase):
    def match(self, pattern, path):
        return bool(runner.glob_to_regex(pattern).match(path))

    def test_double_star_crosses_directories(self):
        self.assertTrue(self.match("ventures/**", "ventures/a/index.html"))
        self.assertTrue(self.match("ventures/**", "ventures/a"))

    def test_single_star_does_not_cross_directories(self):
        self.assertTrue(self.match("ventures/*", "ventures/a"))
        self.assertFalse(self.match("ventures/*", "ventures/a/index.html"))

    def test_a_suffix_glob_matches_at_any_depth(self):
        self.assertTrue(self.match("**.md", "portfolio/ledger/README.md"))
        self.assertFalse(self.match("**.md", "platform/ci/runner.py"))

    def test_the_pattern_must_match_the_whole_path(self):
        # A prefix match would make `platform/ci` select every platform
        # workflow, which is the failure mode that makes the tool useless.
        self.assertFalse(self.match("platform/ci", "platform/ci/runner.py"))

    def test_a_literal_dot_is_not_a_wildcard(self):
        self.assertFalse(self.match("a.yml", "axyml"))


class Selects(unittest.TestCase):
    def selects(self, body, changed):
        return runner.selects(workflow(body), changed)

    def test_a_bare_on_key_is_read_despite_yaml_resolving_it_to_true(self):
        # YAML 1.1 turns `on:` into the boolean True. Reading only "on" would
        # find no triggers and select nothing at all, silently.
        parsed = workflow("""
            on:
              push:
                paths: ["ventures/**"]
        """)
        self.assertNotIn("on", parsed, "expected PyYAML to resolve `on` to True")
        self.assertTrue(runner.selects(parsed, ["ventures/a/index.html"]))

    def test_a_path_filter_selects_only_matching_changes(self):
        body = """
            on:
              push:
                paths: ["ventures/**"]
        """
        self.assertTrue(self.selects(body, ["ventures/a/index.html"]))
        self.assertFalse(self.selects(body, ["platform/ci/runner.py"]))

    def test_no_path_filter_means_every_change_selects_it(self):
        self.assertTrue(self.selects("on:\n  push: {}\n", ["anything"]))

    def test_paths_ignore_holds_only_when_it_covers_every_change(self):
        body = """
            on:
              push:
                paths-ignore: ["**.md"]
        """
        self.assertFalse(self.selects(body, ["README.md"]))
        # One non-doc file is enough to start it, exactly as Actions does.
        self.assertTrue(self.selects(body, ["README.md", "platform/ci/x.py"]))

    def test_a_pull_request_filter_counts_too(self):
        body = """
            on:
              pull_request:
                paths: ["gitops/**"]
        """
        self.assertTrue(self.selects(body, ["gitops/prod/site.yaml"]))

    def test_a_schedule_only_workflow_is_never_selected(self):
        self.assertFalse(self.selects("on:\n  schedule:\n    - cron: '0 4 * * *'\n",
                                      ["ventures/a/index.html"]))

    def test_a_list_form_trigger_has_no_path_filter(self):
        self.assertTrue(self.selects("on: [push, pull_request]\n", ["anything"]))


class ReadOnlyJobs(unittest.TestCase):
    def read_only(self, body):
        """True when every job in the workflow is safe to run here."""
        allowed, held = runner.read_only_jobs(workflow(body))
        return bool(allowed) and not held

    def test_a_workflow_of_assertions_is_read_only(self):
        self.assertTrue(self.read_only("""
            permissions:
              contents: read
            jobs:
              a:
                steps:
                  - run: node --test
        """))

    def test_one_mutating_step_holds_the_whole_workflow(self):
        self.assertFalse(self.read_only("""
            permissions:
              contents: read
            jobs:
              a:
                steps:
                  - run: node --test
                  - run: git push origin main
        """))

    def test_a_workflow_with_no_run_steps_is_not_treated_as_verified(self):
        self.assertFalse(self.read_only("""
            permissions:
              contents: read
            jobs:
              a:
                steps:
                  - uses: actions/checkout@v4
        """))

    def test_an_absent_permissions_block_is_held_back(self):
        """Absent means the repository default, which may be read/write."""
        self.assertFalse(self.read_only("""
            jobs:
              a:
                steps:
                  - run: node --test
        """))

    def test_a_job_may_not_widen_a_read_only_workflow(self):
        self.assertFalse(self.read_only("""
            permissions:
              contents: read
            jobs:
              a:
                permissions:
                  contents: write
                steps:
                  - run: node --test
        """))

    def test_a_secret_reference_holds_the_workflow(self):
        self.assertFalse(self.read_only("""
            permissions:
              contents: read
            jobs:
              a:
                steps:
                  - run: echo "${{ secrets.TOKEN }}"
        """))

    def test_a_writing_job_is_held_without_holding_its_read_only_sibling(self):
        allowed, held = runner.read_only_jobs(workflow("""
            permissions:
              contents: read
            jobs:
              build:
                steps:
                  - run: node --test
              deploy:
                permissions:
                  pages: write
                steps:
                  - run: ./publish.sh
        """))
        self.assertEqual(allowed, {"build"})
        self.assertEqual([job for job, _ in held], ["deploy"])

    def test_branch_cleanup_is_held_back_by_capability_not_by_the_list(self):
        """The regression that shaped this check.

        `branch-cleanup.yml` deletes refs from inside `branch_cleanup.py`, so
        every shell command in it is an innocent `python3 ...` and the mutation
        screen passes it. Only the declared capability gives it away.
        """
        parsed = runner.load_workflow(
            os.path.join(runner.WORKFLOWS, "branch-cleanup.yml"))
        steps, _ = runner.collect(parsed)
        self.assertFalse(any(runner.screen(s) for s in steps),
                         "expected the pattern screen alone to miss this")
        allowed, held = runner.read_only_jobs(parsed)
        self.assertEqual(allowed, set(), f"held: {held}")

    def test_portfolio_pages_runs_its_build_job_and_holds_its_deploy_job(self):
        """The motivating case: the FAQ guard lives in `build`."""
        parsed = runner.load_workflow(
            os.path.join(runner.WORKFLOWS, "portfolio-pages.yml"))
        allowed, held = runner.read_only_jobs(parsed)
        self.assertIn("build", allowed)
        self.assertIn("deploy", [job for job, _ in held])
        steps, _ = runner.collect(parsed, only=allowed)
        self.assertTrue(any("--test" in s.run for s in steps),
                        "the build job must still carry the test step")

    def test_no_auto_run_job_in_the_repo_can_write_or_read_a_secret(self):
        """Whole-repository sweep: the gate must hold across all 218 files."""
        for name in sorted(os.listdir(runner.WORKFLOWS)):
            if not name.endswith((".yml", ".yaml")):
                continue
            parsed = runner.load_workflow(os.path.join(runner.WORKFLOWS, name))
            if not isinstance(parsed, dict):
                continue
            allowed, _ = runner.read_only_jobs(parsed)
            for job_id in allowed:
                job = parsed["jobs"][job_id]
                self.assertFalse(runner._grants_write(parsed),
                                 f"{name} auto-runs {job_id} but grants write")
                self.assertFalse(
                    job.get("permissions") is not None and runner._grants_write(job),
                    f"{name}/{job_id} auto-runs but grants write")
                self.assertFalse(runner._mentions_secret(job),
                                 f"{name}/{job_id} auto-runs but reads a secret")


class ForChanges(unittest.TestCase):
    """The end the tool exists for: a change selects the workflows CI would run."""

    def selected(self, changed):
        names = []
        for name in sorted(os.listdir(runner.WORKFLOWS)):
            if not name.endswith((".yml", ".yaml")):
                continue
            parsed = runner.load_workflow(os.path.join(runner.WORKFLOWS, name))
            if isinstance(parsed, dict) and runner.selects(parsed, changed):
                names.append(name)
        return names

    def test_a_venture_page_selects_the_workflow_that_runs_the_faq_guard(self):
        # The regression this mode exists for. `portfolio-pages.yml` runs
        # `platform/pages/*.test.mjs`, which includes the FAQPage visibility
        # guard that a session verifying only `portfolio-validate.yml` misses.
        names = self.selected(["ventures/cloud-egress-calculator/index.html"])
        self.assertIn("portfolio-pages.yml", names)
        self.assertIn("cloud-egress-calculator-ci.yml", names)

    def test_a_venture_change_does_not_select_an_unrelated_venture(self):
        names = self.selected(["ventures/cloud-egress-calculator/index.html"])
        self.assertNotIn("amazon-fba-calculator-ci.yml", names)

    def test_naming_a_workflow_and_for_changes_together_is_refused(self):
        self.assertEqual(runner.main(["portfolio-validate.yml", "--for-changes"]), 2)

    def test_naming_nothing_at_all_is_refused(self):
        self.assertEqual(runner.main([]), 2)


if __name__ == "__main__":
    unittest.main()
