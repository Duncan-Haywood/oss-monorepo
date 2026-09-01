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

from validate_workflows import REPO_ROOT, check, check_unique_names


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
    steps:
      - run: echo a
  notify:
    permissions:
      contents: read
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
    steps:
      - run: echo a
  deploy:
    permissions:
      contents: read
    steps:
      - run: echo b
"""
        self.assertEqual(errors_for(text), [])

    def test_non_mapping_top_level_is_flagged(self):
        errs = errors_for("- just\n- a\n- list\n")
        self.assertTrue(any("top level must be a mapping" in e for e in errs))


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


if __name__ == "__main__":
    unittest.main()
