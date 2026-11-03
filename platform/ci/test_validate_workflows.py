#!/usr/bin/env python3
"""Unit tests for validate_workflows.check().

The validator runs against the real .github/workflows tree in CI, which proves
the current files pass but exercises none of the failure branches. These tests
drive check() over synthetic workflow files so a future edit to the rules --
especially the per-job permissions logic added when the least-privilege
invariant landed -- can't silently stop catching what it is meant to catch.

Run: python3 -m unittest test_validate_workflows   (from platform/ci/)
"""
import tempfile
import unittest
from pathlib import Path

import yaml

from validate_workflows import (
    REPO_ROOT,
    check,
    check_unique_names,
    check_venture_tests_run,
    duplicates_ventures_tests,
    reserved_github_refs,
    unguarded_shallow_fetches,
)


def errors_for(text):
    """Write `text` to a temp .yml under the repo tree and return check()'s errors."""
    with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
        path = Path(tmp) / "wf.yml"
        path.write_text(text)
        errors = []
        check(path, errors)
        return errors


VALID = """\
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo hi
"""


class CheckTest(unittest.TestCase):
    def test_valid_workflow_has_no_errors(self):
        self.assertEqual(errors_for(VALID), [])

    def test_per_job_permissions_on_every_job_is_accepted(self):
        text = """\
name: Deploy
on: [push]
jobs:
  deploy:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo a
  notify:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo b
"""
        self.assertEqual(errors_for(text), [])

    def test_no_permissions_anywhere_is_flagged(self):
        text = """\
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""
        errs = [e for e in errors_for(text) if "permissions" in e]
        self.assertEqual(len(errs), 1)
        self.assertIn("build", errs[0])

    def test_permissions_missing_on_one_of_several_jobs_is_flagged(self):
        text = """\
name: CI
on: [push]
jobs:
  build:
    permissions:
      contents: read
    steps:
      - run: echo a
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo b
"""
        errs = [e for e in errors_for(text) if "permissions" in e]
        self.assertEqual(len(errs), 1)
        self.assertIn("deploy", errs[0])
        # The scoped job must not be named as missing.
        self.assertNotIn("job(s): build", errs[0])

    def test_unquoted_on_key_is_accepted_as_trigger(self):
        # PyYAML resolves an unquoted `on:` to the boolean True (YAML 1.1);
        # the validator accepts that spelling.
        self.assertEqual([e for e in errors_for(VALID) if "on:" in e], [])

    def test_missing_name_trigger_and_jobs_are_each_flagged(self):
        errs = errors_for("{}")
        self.assertTrue(any("name" in e for e in errs))
        self.assertTrue(any("on:" in e for e in errs))
        self.assertTrue(any("jobs:" in e for e in errs))

    def test_empty_jobs_mapping_is_flagged(self):
        errs = errors_for("name: CI\non: [push]\njobs: {}\n")
        self.assertTrue(any("jobs:" in e for e in errs))

    def test_non_mapping_jobs_is_flagged_not_a_crash(self):
        errs = errors_for("name: CI\non: [push]\njobs:\n  - build\n")
        self.assertTrue(any("jobs:" in e for e in errs))

    def test_unparseable_yaml_is_flagged(self):
        errs = errors_for("name: [unterminated\n")
        self.assertEqual(len(errs), 1)
        self.assertIn("not valid YAML", errs[0])

    def test_duplicate_top_level_key_is_flagged(self):
        text = """\
name: CI
on: [push]
permissions:
  contents: read
permissions:
  contents: write
jobs:
  build:
    steps:
      - run: echo hi
"""
        errs = errors_for(text)
        self.assertEqual(len(errs), 1)
        self.assertIn("repeats a mapping key", errs[0])
        self.assertIn("permissions", errs[0])

    def test_duplicate_key_inside_a_job_is_flagged(self):
        text = """\
name: CI
on: [push]
jobs:
  build:
    permissions:
      contents: read
    permissions:
      contents: write
    steps:
      - run: echo hi
"""
        errs = errors_for(text)
        self.assertEqual(len(errs), 1)
        self.assertIn("repeats a mapping key", errs[0])

    def test_repeated_key_in_sibling_mappings_is_not_a_duplicate(self):
        # Two jobs may each carry their own `permissions:` -- only a repeat
        # within one mapping is an error.
        text = """\
name: CI
on: [push]
jobs:
  build:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo a
  deploy:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo b
"""
        self.assertEqual(errors_for(text), [])

    def test_non_mapping_top_level_is_flagged(self):
        errs = errors_for("- just\n- a\n- list\n")
        self.assertTrue(any("top level must be a mapping" in e for e in errs))


class JobTimeoutTest(unittest.TestCase):
    """Invariant 6: every job caps its own runtime with `timeout-minutes`."""

    def test_a_job_without_a_timeout_is_flagged(self):
        text = """\
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
"""
        errs = [e for e in errors_for(text) if "timeout-minutes" in e]
        self.assertEqual(len(errs), 1, errs)
        self.assertIn("build", errs[0])

    def test_one_uncapped_job_among_capped_ones_is_flagged(self):
        text = """\
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo a
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo b
"""
        errs = [e for e in errors_for(text) if "timeout-minutes" in e]
        self.assertEqual(len(errs), 1, errs)
        self.assertIn("deploy", errs[0])
        # The capped job must not be named as missing.
        self.assertNotIn("build", errs[0])

    def test_a_reusable_workflow_caller_is_exempt(self):
        # A job that only calls a reusable workflow has no runs-on and GitHub
        # rejects a job timeout on it; the cap belongs in the called workflow.
        text = """\
name: CI
on: [push]
permissions:
  contents: read
jobs:
  call:
    uses: ./.github/workflows/reusable.yml
"""
        self.assertEqual([e for e in errors_for(text) if "timeout-minutes" in e], [])

    def test_the_real_workflow_tree_caps_every_job(self):
        # Regression guard for the live tree: #3040 capped the eight PR-gating
        # workflows, and the fleet's ~200 venture CI jobs were capped alongside
        # this invariant. No job on main may ride the 360-minute default again.
        workflows_dir = REPO_ROOT / ".github" / "workflows"
        offenders = {}
        for path in sorted(
            p for p in workflows_dir.iterdir() if p.suffix in {".yml", ".yaml"}
        ):
            data = yaml.safe_load(path.read_text())
            if not isinstance(data, dict):
                continue
            uncapped = [
                name
                for name, body in (data.get("jobs") or {}).items()
                if isinstance(body, dict)
                and "timeout-minutes" not in body
                and "uses" not in body
            ]
            if uncapped:
                offenders[path.name] = uncapped
        self.assertEqual(offenders, {})


class CheckUniqueNamesTest(unittest.TestCase):
    def _write(self, tmp, filename, text):
        path = Path(tmp) / filename
        path.write_text(text)
        return path

    def test_two_files_sharing_a_name_are_flagged(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            a = self._write(tmp, "a.yml", "name: CI\non: [push]\njobs: {build: {}}\n")
            b = self._write(tmp, "b.yml", "name: CI\non: [push]\njobs: {build: {}}\n")
            errs = check_unique_names([a, b])
        self.assertEqual(len(errs), 1)
        self.assertIn("CI", errs[0])
        self.assertIn("a.yml", errs[0])
        self.assertIn("b.yml", errs[0])

    def test_distinct_names_are_not_flagged(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            a = self._write(tmp, "a.yml", "name: a CI\non: [push]\njobs: {build: {}}\n")
            b = self._write(tmp, "b.yml", "name: b CI\non: [push]\njobs: {build: {}}\n")
            self.assertEqual(check_unique_names([a, b]), [])

    def test_files_with_no_name_do_not_collide_with_each_other(self):
        # check() already reports a missing `name:` on its own; two nameless
        # files must not also be reported here as "sharing" an absent name.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            a = self._write(tmp, "a.yml", "on: [push]\njobs: {build: {}}\n")
            b = self._write(tmp, "b.yml", "on: [push]\njobs: {build: {}}\n")
            self.assertEqual(check_unique_names([a, b]), [])

    def test_unparseable_file_is_skipped_rather_than_crashing(self):
        # check() reports the parse failure on its own; this pass must not
        # also raise trying to read a `name:` out of broken YAML.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            a = self._write(tmp, "a.yml", "name: [unterminated\n")
            b = self._write(tmp, "b.yml", "name: CI\non: [push]\njobs: {build: {}}\n")
            self.assertEqual(check_unique_names([a, b]), [])

    def test_the_real_workflow_tree_has_no_duplicate_names(self):
        # Regression for the actual bug this check found: print-atelier-ci.yml,
        # quick-pick-survey-ci.yml and retail-pilot-intel-ci.yml all carried the
        # generic `name: CI` until this test was added.
        workflows_dir = REPO_ROOT / ".github" / "workflows"
        paths = sorted(
            p for p in workflows_dir.iterdir() if p.suffix in {".yml", ".yaml"}
        )
        self.assertEqual(check_unique_names(paths), [])



class VentureTestsRunTest(unittest.TestCase):
    """Invariant 7: a venture's `*.test.mjs` files must run in some workflow.

    The failure this catches is silent by construction -- the tests pass on a
    contributor's machine and simply never execute anywhere else -- so the
    synthetic cases below matter more than usual: nothing about the live tree
    tells you whether the rule still fires.
    """

    def _tree(self, tmp, ventures, workflows):
        """Build a fake ventures/ and workflows/ pair; return (dir, paths)."""
        root = Path(tmp)
        vdir = root / "ventures"
        for slug, files in ventures.items():
            (vdir / slug).mkdir(parents=True)
            for name in files:
                (vdir / slug / name).write_text("// test\n")
        wdir = root / "workflows"
        wdir.mkdir()
        paths = []
        for name, text in workflows.items():
            path = wdir / name
            path.write_text(text)
            paths.append(path)
        return vdir, paths

    def _workflow(self, slug, run="node --test"):
        return (
            f"name: {slug} CI\n"
            "on:\n"
            "  pull_request:\n"
            "    paths:\n"
            f'      - "ventures/{slug}/**"\n'
            "jobs:\n"
            "  test:\n"
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 20\n"
            "    steps:\n"
            f"      - run: {run}\n"
        )

    def test_a_venture_whose_workflow_runs_node_test_is_covered(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"widget-calculator": ["calc.test.mjs"]},
                {"widget-calculator-ci.yml": self._workflow("widget-calculator")},
            )
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_a_venture_with_no_workflow_at_all_is_reported(self):
        # The eleven ventures this check first found: graduated after
        # 2026-09-02 with 4-7 test files each and no `<slug>-ci.yml`.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp, {"widget-calculator": ["calc.test.mjs", "page.test.mjs"]}, {}
            )
            errors = check_venture_tests_run(paths, vdir)
            self.assertEqual(len(errors), 1, errors)
            self.assertIn("ventures/widget-calculator", errors[0])
            self.assertIn("calc.test.mjs", errors[0])
            # The message has to name the fix, not just the fault.
            self.assertIn("ventures-tests.yml", errors[0])

    def test_the_remedy_does_not_ask_for_a_per_venture_copy(self):
        # Until 2026-10-29 this message said "copy a sibling", and 802
        # copies of one `node --test` job accumulated; invariant 8 now
        # rejects such a copy, so the remedy must not ask for one.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp, {"widget-calculator": ["calc.test.mjs"]}, {}
            )
            errors = check_venture_tests_run(paths, vdir)
            self.assertEqual(len(errors), 1, errors)
            self.assertNotIn("copy a sibling", errors[0])
            self.assertNotIn("widget-calculator-ci.yml", errors[0])

    def test_a_slug_filtered_workflow_that_runs_no_js_tests_is_not_coverage(self):
        # The other five: a Python venture that later gained a browser page,
        # whose workflow still ran only pytest. Filtering on the venture is
        # half of coverage; running the tests is the other half.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"evidence-tool": ["page.test.mjs"]},
                {
                    "evidence-tool-ci.yml": self._workflow(
                        "evidence-tool", run="python3 -m pytest -q"
                    )
                },
            )
            errors = check_venture_tests_run(paths, vdir)
            self.assertEqual(len(errors), 1, errors)
            self.assertIn("ventures/evidence-tool", errors[0])

    def test_a_glob_filtered_shared_workflow_is_not_coverage(self):
        # proposal-module-ci.yml runs `node --test` but filters on
        # `ventures/*/proposal.test.mjs`, so it covers exactly one filename in
        # each venture and nothing else. Counting it would mark every venture
        # with a proposal panel as covered while its calculator went untested.
        shared = (
            "name: proposal module CI\n"
            "on:\n"
            "  pull_request:\n"
            "    paths:\n"
            '      - "ventures/*/proposal.test.mjs"\n'
            "jobs:\n"
            "  test:\n"
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 20\n"
            "    steps:\n"
            "      - run: node --test platform/proposal/*.test.mjs\n"
        )
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"widget-calculator": ["calc.test.mjs", "proposal.test.mjs"]},
                {"proposal-module-ci.yml": shared},
            )
            errors = check_venture_tests_run(paths, vdir)
            self.assertEqual(len(errors), 1, errors)

    def test_npm_test_counts_as_running_the_tests(self):
        # `no-show-fee-calculator` spells it this way; its package.json script
        # is `node --test test/*.test.mjs`, so the tests do run.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"widget-calculator": ["calc.test.mjs"]},
                {
                    "widget-calculator-ci.yml": self._workflow(
                        "widget-calculator", run="npm test"
                    )
                },
            )
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_tests_nested_below_the_venture_root_are_seen(self):
        # `no-show-fee-calculator` keeps its suites in `test/`; a check that
        # only globbed the venture root would call it covered by accident and
        # uncovered ventures with the same layout invisible.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(tmp, {"widget-calculator": []}, {})
            (vdir / "widget-calculator" / "test").mkdir()
            (vdir / "widget-calculator" / "test" / "calc.test.mjs").write_text("//\n")
            errors = check_venture_tests_run(paths, vdir)
            self.assertEqual(len(errors), 1, errors)
            self.assertIn("test/calc.test.mjs", errors[0])

    def test_a_dependency_tree_does_not_make_a_venture_look_uncovered(self):
        # No venture commits a node_modules, but one has a package.json, and
        # an `npm install` there would otherwise fill the glob with a
        # dependency's own suites -- failing this check on one machine only.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(tmp, {"widget-calculator": []}, {})
            dep = vdir / "widget-calculator" / "node_modules" / "some-lib"
            dep.mkdir(parents=True)
            (dep / "index.test.mjs").write_text("//\n")
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_a_venture_shipping_no_mjs_tests_is_not_required_to_have_one(self):
        # Python-only and Next.js ventures exist; this invariant is about
        # tests that are written and never run, not about mandating tests.
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(tmp, {"python-tool": ["README.md"]}, {})
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_an_unquoted_on_key_still_has_its_paths_read(self):
        # PyYAML resolves an unquoted `on:` to the boolean True under YAML
        # 1.1 -- the trap check() already works around. Missing it here would
        # make every workflow in the repo look like it filters on nothing,
        # so the check would report all 198 ventures and be turned off.
        text = self._workflow("widget-calculator")
        self.assertTrue(text.startswith("name: widget-calculator CI\non:"))
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"widget-calculator": ["calc.test.mjs"]},
                {"widget-calculator-ci.yml": text},
            )
            self.assertIs(True, "on" not in yaml.safe_load(text))
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_an_unparseable_workflow_is_skipped_rather_than_crashing(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as tmp:
            vdir, paths = self._tree(
                tmp,
                {"widget-calculator": ["calc.test.mjs"]},
                {
                    "broken.yml": "name: [unterminated\n",
                    "widget-calculator-ci.yml": self._workflow("widget-calculator"),
                },
            )
            self.assertEqual(check_venture_tests_run(paths, vdir), [])

    def test_the_real_venture_tree_has_every_test_file_running_somewhere(self):
        # Regression for the bug this check was written from: on 2026-09-07,
        # 16 ventures shipped 62 `*.test.mjs` files that no workflow ran.
        workflows_dir = REPO_ROOT / ".github" / "workflows"
        paths = sorted(
            p for p in workflows_dir.iterdir() if p.suffix in {".yml", ".yaml"}
        )
        self.assertEqual(check_venture_tests_run(paths), [])


class DuplicateVentureTestWorkflowTest(unittest.TestCase):
    """Invariant 8: a per-venture workflow that only re-runs ventures-tests.yml."""

    def workflow(self, steps, extra_paths=()):
        paths = ["ventures/widget/**", ".github/workflows/widget-ci.yml", *extra_paths]
        return yaml.safe_load(yaml.safe_dump({
            "on": {"pull_request": {"paths": paths}, "push": {"paths": paths}},
            "jobs": {"test": {"runs-on": "ubuntu-latest", "steps": [
                {"uses": "actions/checkout@abc"},
                {"uses": "actions/setup-node@def"},
                *steps,
            ]}},
        }))

    def test_a_bare_node_test_workflow_is_a_duplicate(self):
        data = self.workflow([{"run": "node --test"}])
        self.assertEqual(duplicates_ventures_tests("widget-ci.yml", data), "widget")

    def test_naming_the_test_files_is_still_a_duplicate(self):
        data = self.workflow([{"run": "node --test engine.test.mjs page.test.mjs"}])
        self.assertEqual(duplicates_ventures_tests("widget-ci.yml", data), "widget")

    def test_a_workflow_that_also_runs_pytest_is_not(self):
        data = self.workflow([{"run": "node --test"}, {"run": "python3 -m pytest -q"}])
        self.assertIsNone(duplicates_ventures_tests("widget-ci.yml", data))

    def test_a_workflow_watching_a_shared_path_too_is_not(self):
        data = self.workflow([{"run": "node --test"}], extra_paths=["platform/pages/**"])
        self.assertIsNone(duplicates_ventures_tests("widget-ci.yml", data))

    def test_a_workflow_with_another_action_is_not(self):
        data = self.workflow([{"uses": "actions/setup-python@x"}, {"run": "node --test"}])
        self.assertIsNone(duplicates_ventures_tests("widget-ci.yml", data))

    def test_ventures_tests_itself_is_not(self):
        path = REPO_ROOT / ".github" / "workflows" / "ventures-tests.yml"
        data = yaml.safe_load(path.read_text())
        self.assertIsNone(duplicates_ventures_tests(path.name, data))


class ReservedGithubNamesTest(unittest.TestCase):
    """Invariant 5: a `GITHUB_`-prefixed variable or secret can never be set."""

    def test_a_reserved_github_prefixed_variable_is_rejected(self):
        # The shape of the bug that shipped: portfolio-pages.yml gated its
        # whole deploy job on `vars.GITHUB_PAGES_ENABLED`, a name GitHub will
        # not let anyone create, so the gate was always false and the run was
        # always green.
        text = """\
name: Deploy
on: [push]
permissions:
  contents: read
jobs:
  deploy:
    if: ${{ vars.GITHUB_PAGES_ENABLED == 'true' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo hi
"""
        errors = errors_for(text)
        self.assertEqual(len(errors), 1, errors)
        self.assertIn("vars.GITHUB_PAGES_ENABLED", errors[0])
        # The message must name the fix, not just the fault.
        self.assertIn("vars.PAGES_ENABLED", errors[0])

    def test_a_reserved_github_prefixed_secret_is_rejected(self):
        text = VALID.replace(
            "      - run: echo hi",
            "      - run: echo hi\n        env:\n"
            "          T: ${{ secrets.GITHUB_MY_TOKEN }}",
        )
        errors = errors_for(text)
        self.assertEqual(len(errors), 1, errors)
        self.assertIn("secrets.GITHUB_MY_TOKEN", errors[0])

    def test_github_token_is_the_one_allowed_github_prefixed_secret(self):
        # GitHub injects it; nobody creates it. Flagging it would fail nine
        # workflows on `main` that legitimately pass it to a step.
        text = VALID.replace(
            "      - run: echo hi",
            "      - run: echo hi\n        env:\n"
            "          T: ${{ secrets.GITHUB_TOKEN }}",
        )
        self.assertEqual(errors_for(text), [])

    def test_a_github_prefix_outside_an_expression_is_not_flagged(self):
        # Several workflow headers discuss this trap by name because of the
        # Pages bug. Scanning raw text rather than parsed expressions would
        # fail those files for documenting the thing they get right.
        text = VALID.replace(
            "name: CI",
            "# Not `vars.GITHUB_PAGES_ENABLED` -- GitHub reserves that prefix.\nname: CI",
        )
        self.assertEqual(errors_for(text), [])

    def test_the_real_workflow_tree_references_no_reserved_names(self):
        # The regression guard for the live tree, alongside the synthetic
        # cases above: main must never regain a gate that cannot be flipped.
        workflows_dir = REPO_ROOT / ".github" / "workflows"
        offenders = {}
        for path in sorted(
            p for p in workflows_dir.iterdir() if p.suffix in {".yml", ".yaml"}
        ):
            data = yaml.safe_load(path.read_text())
            found = reserved_github_refs(data)
            if found:
                offenders[path.name] = sorted(found)
        self.assertEqual(offenders, {})


class UnguardedShallowFetchTest(unittest.TestCase):
    """A `--depth` fetch truncates the whole clone, not just the ref it names.

    Free on a runner, where `actions/checkout` already made the checkout depth
    1. Destructive on a full clone -- and `run_workflow_locally.py` runs these
    same `run:` steps against one, which is how `portfolio-validate.yml`'s
    base-ref fetch came to shallow a 7,289-commit checkout of `main` and then
    report `main` RED at the next step, for a venture deletion that never
    happened. See `unguarded_shallow_fetches`' docstring for the full
    measurement.

    The real-tree case at the bottom is the one that matters over time; the
    synthetic ones above it keep the rule itself from silently stopping.
    """

    def _workflow(self, run_body):
        return (
            "name: CI\n"
            "on: [push]\n"
            "permissions:\n"
            "  contents: read\n"
            "jobs:\n"
            "  build:\n"
            "    runs-on: ubuntu-latest\n"
            "    timeout-minutes: 10\n"
            "    steps:\n"
            "      - name: fetch\n"
            f"        run: {run_body}\n"
        )

    def assert_flagged(self, run_body):
        errors = errors_for(self._workflow(run_body))
        self.assertEqual(len(errors), 1, f"expected exactly one error for: {run_body}")
        self.assertIn("is-shallow-repository", errors[0])
        self.assertIn("truncates the WHOLE repository", errors[0])

    def assert_clean(self, run_body):
        self.assertEqual(errors_for(self._workflow(run_body)), [])

    def test_an_unconditional_depth_fetch_is_flagged(self):
        self.assert_flagged(
            "git fetch --no-tags --depth=1 origin +refs/heads/main:refs/ci/base-main"
        )

    def test_a_trailing_depth_flag_is_flagged_too(self):
        # `opencode-high-throughput.yml` spelled it this way, after a
        # `fetch-depth: 0` checkout -- so it discarded the full history the
        # checkout had just been asked for, on the runner as well as locally.
        self.assert_flagged("git fetch origin main --depth=50")

    def test_a_guarded_depth_fetch_passes(self):
        self.assert_clean(
            '|\n'
            '          if [ "$(git rev-parse --is-shallow-repository)" = true ]; then\n'
            "            git fetch --no-tags --depth=1 origin main:refs/ci/base-main\n"
            "          else\n"
            "            git fetch --no-tags origin main:refs/ci/base-main\n"
            "          fi"
        )

    def test_the_opposite_operations_are_not_flagged(self):
        # `--unshallow` and `--deepen` add history rather than discarding it.
        # Matching either would make the rule fire on the very command
        # CLAUDE.md prescribes for getting *out* of a shallow clone.
        self.assert_clean("git fetch --unshallow origin main")
        self.assert_clean("git fetch --deepen=10 origin main")
        self.assert_clean("git fetch --no-tags origin main:refs/ci/base-main")

    def test_the_real_workflow_tree_has_no_unguarded_shallow_fetch(self):
        workflows_dir = REPO_ROOT / ".github" / "workflows"
        offenders = {}
        for path in sorted(
            p for p in workflows_dir.iterdir() if p.suffix in {".yml", ".yaml"}
        ):
            data = yaml.safe_load(path.read_text())
            if not isinstance(data, dict):
                continue
            found = unguarded_shallow_fetches(data)
            if found:
                offenders[path.name] = found
        self.assertEqual(offenders, {})


if __name__ == "__main__":
    unittest.main()


class PullRequestConcurrencyTest(unittest.TestCase):
    """Invariant 9: a pull_request workflow declares a concurrency group."""

    BASE = """\
name: CI
on: {on}
permissions:
  contents: read
{conc}jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
{jobconc}    steps:
      - run: echo hi
"""
    GROUP = "concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n"

    def errs(self, on, conc="", jobconc=""):
        text = self.BASE.format(on=on, conc=conc, jobconc=jobconc)
        return [e for e in errors_for(text) if "concurrency" in e]

    def test_a_pull_request_workflow_without_a_group_is_flagged(self):
        self.assertEqual(len(self.errs("[pull_request, push]")), 1)

    def test_the_mapping_form_of_on_is_read_too(self):
        self.assertEqual(len(self.errs("{pull_request: {paths: [a/**]}}")), 1)

    def test_a_top_level_group_passes(self):
        self.assertEqual(self.errs("[pull_request]", conc=self.GROUP), [])

    def test_a_group_on_every_job_passes(self):
        jobconc = "    concurrency: x-${{ github.ref }}\n"
        self.assertEqual(self.errs("[pull_request]", jobconc=jobconc), [])

    def test_push_only_and_pull_request_target_are_not_required(self):
        self.assertEqual(self.errs("[push]"), [])
        self.assertEqual(self.errs("[pull_request_target]"), [])

    def test_the_real_workflow_tree_groups_every_pull_request_workflow(self):
        from validate_workflows import WORKFLOWS_DIR
        errors = []
        for path in sorted(WORKFLOWS_DIR.glob("*.yml")):
            check(path, errors)
        self.assertEqual([e for e in errors if "concurrency" in e], [])
