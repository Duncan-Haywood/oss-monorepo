#!/usr/bin/env python3
"""Unit tests for secrets_inventory.py, over throwaway repositories.

Run: python3 -m unittest test_secrets_inventory   (from platform/ci/)
"""
import tempfile
import textwrap
import unittest
from pathlib import Path

import yaml

from secrets_inventory import REPO_ROOT, INVENTORY, check, main, usage

WF = """\
name: deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [production, demo]
permissions:
  contents: read
env:
  # ${{ secrets.IN_A_COMMENT }} is not a reference
  TOP: ${{ secrets.TOP_LEVEL }}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "$RUNNER_TEMP/worker-secrets.json"
        env:
          A: ${{ secrets.ALPHA || secrets.ALPHA_ALIAS }}
          B: ${{ secrets['BRACKETED'] }}
  ship:
    environment: ${{ github.event_name == 'workflow_dispatch' && inputs.environment || 'production' }}
    runs-on: ubuntu-latest
    steps:
      - run: deploy
        env:
          A: ${{ secrets.ALPHA }}
  pub:
    environment:
      name: publish
    runs-on: ubuntu-latest
    steps:
      - run: deploy
        env:
          T: ${{ secrets.GITHUB_TOKEN }}
"""


def entry(name, workflows, environments, **extra):
    e = {
        "name": name, "provider": "p", "scope": "s", "workflows": workflows,
        "environments": environments, "rotation": "manual", "owner_action": "none",
    }
    e.update(extra)
    return e


GOOD = [
    entry("TOP_LEVEL", ["deploy.yml"], ["repository"]),
    entry("ALPHA", ["deploy.yml"], ["demo", "production", "repository"]),
    entry("ALPHA_ALIAS", ["deploy.yml"], ["repository"], alias_of="ALPHA"),
    entry("BRACKETED", ["deploy.yml"], ["repository"]),
    entry("GITHUB_TOKEN", ["deploy.yml"], ["publish"], rotation="short-lived"),
]


class Repo:
    def __init__(self, workflows=None, secrets=None, retired=None, raw=None):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        wf_dir = self.root / ".github" / "workflows"
        wf_dir.mkdir(parents=True)
        for name, text in (workflows if workflows is not None else {"deploy.yml": WF}).items():
            (wf_dir / name).write_text(text)
        self.inventory = self.root / INVENTORY
        self.inventory.parent.mkdir(parents=True)
        if raw is not None:
            self.inventory.write_text(raw)
        else:
            doc = {"secrets": secrets if secrets is not None else GOOD, "retired": retired or []}
            self.inventory.write_text(yaml.safe_dump(doc, sort_keys=False))

    def problems(self):
        return check(self.root, self.inventory)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.tmp.cleanup()


class UsageTests(unittest.TestCase):
    def test_reads_expressions_not_comments_or_file_names(self):
        with Repo() as r:
            used, inherit, errors = usage(r.root)
        self.assertEqual(sorted(used), ["ALPHA", "ALPHA_ALIAS", "BRACKETED", "GITHUB_TOKEN", "TOP_LEVEL"])
        self.assertEqual(inherit, [])
        self.assertEqual(errors, [])

    def test_expression_environment_resolves_to_choice_options_and_fallback(self):
        with Repo() as r:
            used, _, _ = usage(r.root)
        self.assertEqual(used["ALPHA"]["environments"], {"demo", "production", "repository"})
        self.assertEqual(used["GITHUB_TOKEN"]["environments"], {"publish"})

    def test_bare_if_expression_counts(self):
        wf = "on: push\njobs:\n  a:\n    if: secrets.IN_IF != ''\n    runs-on: x\n    steps: [{run: echo}]\n"
        with Repo(workflows={"w.yml": wf}, secrets=[]) as r:
            used, _, _ = usage(r.root)
        self.assertIn("IN_IF", used)

    def test_unparseable_workflow_is_reported(self):
        with Repo(workflows={"bad.yml": "jobs: [\n"}, secrets=[]) as r:
            self.assertTrue(any("does not parse" in p for p in r.problems()))


class CheckTests(unittest.TestCase):
    def test_clean(self):
        with Repo() as r:
            self.assertEqual(r.problems(), [])

    def test_missing_from_inventory(self):
        with Repo(secrets=GOOD[1:]) as r:
            self.assertEqual(r.problems(), ["TOP_LEVEL: read by deploy.yml but missing from secrets-inventory.yaml"])

    def test_listed_but_unused(self):
        with Repo(secrets=GOOD + [entry("STALE", ["deploy.yml"], ["repository"])]) as r:
            self.assertEqual(len(r.problems()), 1)
            self.assertIn("STALE: listed", r.problems()[0])

    def test_workflows_and_environments_must_match(self):
        bad = [dict(e) for e in GOOD]
        bad[1] = entry("ALPHA", ["other.yml"], ["production"])
        with Repo(secrets=bad) as r:
            probs = r.problems()
        self.assertTrue(any("ALPHA: `workflows`" in p for p in probs))
        self.assertTrue(any("ALPHA: `environments`" in p for p in probs))

    def test_retired_secret_read_again_fails(self):
        with Repo(secrets=GOOD[1:], retired=[{"name": "TOP_LEVEL", "owner_action": "delete it"}]) as r:
            probs = r.problems()
        self.assertEqual(len(probs), 1)
        self.assertIn("TOP_LEVEL: retired, but read again", probs[0])

    def test_retired_and_unused_is_fine(self):
        with Repo(retired=[{"name": "OLD_TOKEN", "owner_action": "delete it"}]) as r:
            self.assertEqual(r.problems(), [])

    def test_required_fields_and_rotation(self):
        bad = [dict(e) for e in GOOD]
        bad[0] = {"name": "TOP_LEVEL", "workflows": ["deploy.yml"], "environments": ["repository"], "rotation": "yearly"}
        with Repo(secrets=bad) as r:
            probs = r.problems()
        self.assertTrue(any("TOP_LEVEL: missing provider, scope, owner_action" in p for p in probs))
        self.assertTrue(any("rotation must be one of" in p for p in probs))

    def test_duplicate_and_dangling_alias(self):
        bad = GOOD + [GOOD[0]]
        bad = [dict(e) for e in bad]
        bad[2]["alias_of"] = "NOPE"
        with Repo(secrets=bad) as r:
            probs = r.problems()
        self.assertTrue(any("TOP_LEVEL: listed twice" in p for p in probs))
        self.assertTrue(any("alias_of names 'NOPE'" in p for p in probs))

    def test_value_shaped_text_fails(self):
        fake = "ghp_" + "a1" * 18  # built at runtime so this file holds no token-shaped literal
        doc = yaml.safe_dump({"secrets": [dict(GOOD[0], scope=f"oops {fake}")] + GOOD[1:], "retired": []})
        with Repo(raw=doc) as r:
            self.assertTrue(any("shaped like a secret value" in p for p in r.problems()))

    def test_secrets_inherit_is_reported(self):
        wf = "on: push\njobs:\n  call:\n    uses: ./.github/workflows/x.yml\n    secrets: inherit\n"
        with Repo(workflows={"w.yml": wf}, secrets=[]) as r:
            self.assertTrue(any("secrets: inherit" in p for p in r.problems()))

    def test_main_exit_codes(self):
        with Repo() as r:
            self.assertEqual(main(["--root", str(r.root)]), 0)
        with Repo(secrets=[]) as r:
            self.assertEqual(main(["--root", str(r.root)]), 1)


class ThisRepositoryTests(unittest.TestCase):
    def test_this_repository_inventory_is_current(self):
        self.assertEqual(check(REPO_ROOT, REPO_ROOT / INVENTORY), [])


if __name__ == "__main__":
    unittest.main()
