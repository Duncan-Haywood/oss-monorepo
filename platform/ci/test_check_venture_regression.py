#!/usr/bin/env python3
"""Tests for `check_venture_regression.py`.

Each test builds a real git repository in a temp directory rather than mocking
`git`, because every fact this checker reads is a git fact -- blob identity
across a rename, a path present at one ref and absent at another, a ref that
does not exist in a shallow clone. A mocked `git ls-tree` would be asserting
about the test's own idea of git.

Run the way CI does (these are `unittest`, not pytest, and they resolve their
import by name, so the working directory matters):

    cd platform/ci && python3 -m unittest test_check_venture_regression
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import check_venture_regression as cvr


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ("git", *args), cwd=repo, capture_output=True, text=True, check=True
    )
    return result.stdout


class VentureRegressionTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "test@example.invalid")
        git(self.repo, "config", "user.name", "Test")

        self._patched = cvr.REPO_ROOT
        cvr.REPO_ROOT = self.repo
        self.addCleanup(self._restore)

    def _restore(self) -> None:
        cvr.REPO_ROOT = self._patched

    # -- fixture helpers -------------------------------------------------

    def write_venture(self, slug: str, body: str = "name: a venture\n") -> None:
        directory = self.repo / "ventures" / slug
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "VENTURE.yaml").write_text(body)
        (directory / "index.html").write_text(f"<h1>{slug}</h1>\n")

    def remove_venture(self, slug: str) -> None:
        git(self.repo, "rm", "-r", "-q", f"ventures/{slug}")

    def write_launched(self, slugs: list[str]) -> None:
        path = self.repo / "platform" / "pages"
        path.mkdir(parents=True, exist_ok=True)
        (path / "launched.json").write_text(
            json.dumps({"launched": {s: "2026-09-07" for s in slugs}}, indent=2) + "\n"
        )

    def commit(self, message: str) -> str:
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", message)
        return git(self.repo, "rev-parse", "HEAD").strip()

    def base_with(self, slugs: list[str]) -> None:
        """Commit `slugs` as the catalogue, and point `origin/main` at it."""
        for slug in slugs:
            self.write_venture(slug)
        self.write_launched(slugs)
        self.commit("base catalogue")
        git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")

    def run_check(self, *argv: str) -> int:
        return cvr.main(list(argv))

    # -- the cases -------------------------------------------------------

    def test_unchanged_catalogue_passes(self) -> None:
        self.base_with(["alpha", "beta"])
        self.assertEqual(self.run_check(), cvr.EXIT_OK)

    def test_added_venture_passes(self) -> None:
        """Growth is the normal case and must never trip the guard."""
        self.base_with(["alpha"])
        self.write_venture("beta")
        self.write_launched(["alpha", "beta"])
        self.commit("add beta")
        self.assertEqual(self.run_check(), cvr.EXIT_OK)

    def test_removed_manifest_fails(self) -> None:
        """The PR #3740 shape: a graduated venture vanishes from the tree."""
        self.base_with(["alpha", "beta"])
        self.remove_venture("beta")
        self.write_launched(["alpha"])
        self.commit("stale tree drops beta")
        self.assertEqual(self.run_check(), cvr.EXIT_REGRESSION)

    def test_removed_launched_entry_alone_fails(self) -> None:
        """A venture can leave the served catalogue without leaving the tree.

        That is the half a `ventures/` directory listing cannot see: the files
        are all present, and the front door no longer offers the tool.
        """
        self.base_with(["alpha", "beta"])
        self.write_launched(["alpha"])
        self.commit("drop beta from the front door only")
        self.assertEqual(self.run_check(), cvr.EXIT_REGRESSION)

    def test_regression_names_the_slug_and_both_registries(self) -> None:
        self.base_with(["alpha", "beta"])
        self.remove_venture("beta")
        self.write_launched(["alpha"])
        self.commit("drop beta")

        regressions, renames = cvr.find_regressions("origin/main", None, set())
        self.assertEqual([r["slug"] for r in regressions], ["beta"])
        self.assertEqual(renames, [])
        self.assertEqual(
            regressions[0]["lost"],
            ["ventures/beta/VENTURE.yaml", "platform/pages/launched.json entry"],
        )

    def test_retired_marker_permits_removal(self) -> None:
        """A deliberate withdrawal leaves a reviewable artifact in the diff."""
        self.base_with(["alpha", "beta"])
        self.remove_venture("beta")
        (self.repo / "ventures" / "beta").mkdir(parents=True, exist_ok=True)
        (self.repo / "ventures" / "beta" / "RETIRED.md").write_text(
            "Withdrawn 2026-09-07: the upstream API it wrapped was switched off.\n"
        )
        self.write_launched(["alpha"])
        self.commit("retire beta on purpose")
        self.assertEqual(self.run_check(), cvr.EXIT_OK)

    def test_allow_flag_permits_removal(self) -> None:
        self.base_with(["alpha", "beta"])
        self.remove_venture("beta")
        self.write_launched(["alpha"])
        self.commit("drop beta")
        self.assertEqual(self.run_check("--allow", "beta"), cvr.EXIT_OK)
        # and it is scoped to the slug named, not a blanket opt-out
        self.assertEqual(self.run_check("--allow", "gamma"), cvr.EXIT_REGRESSION)

    def test_exact_rename_is_not_a_regression(self) -> None:
        """A directory move keeps the manifest blob, so it is not a withdrawal."""
        self.base_with(["alpha", "beta"])
        git(self.repo, "mv", "ventures/beta", "ventures/beta-renamed")
        self.write_launched(["alpha", "beta-renamed"])
        self.commit("rename beta")

        regressions, renames = cvr.find_regressions("origin/main", None, set())
        self.assertEqual(regressions, [])
        self.assertEqual(renames, [{"slug": "beta", "to": "beta-renamed"}])
        self.assertEqual(self.run_check(), cvr.EXIT_OK)

    def test_rename_that_edits_the_manifest_still_fails(self) -> None:
        """Blob identity is the whole rename proof, so an edit breaks it.

        Deliberately asserted: the guard would rather ask for `--allow` than
        guess that two differing manifests are the same venture.
        """
        self.base_with(["alpha", "beta"])
        git(self.repo, "mv", "ventures/beta", "ventures/beta-renamed")
        (self.repo / "ventures" / "beta-renamed" / "VENTURE.yaml").write_text(
            "name: a renamed venture\n"
        )
        self.write_launched(["alpha", "beta-renamed"])
        self.commit("rename and edit beta")
        self.assertEqual(self.run_check(), cvr.EXIT_REGRESSION)
        self.assertEqual(self.run_check("--allow", "beta"), cvr.EXIT_OK)

    def test_head_ref_mode_matches_worktree_mode(self) -> None:
        self.base_with(["alpha", "beta"])
        self.remove_venture("beta")
        self.write_launched(["alpha"])
        head = self.commit("drop beta")
        git(self.repo, "checkout", "-q", "--detach", "origin/main")
        # The working tree is now clean against the base; only the ref regresses.
        self.assertEqual(self.run_check(), cvr.EXIT_OK)
        self.assertEqual(self.run_check("--head", head), cvr.EXIT_REGRESSION)

    def test_missing_base_ref_is_unrun_not_pass(self) -> None:
        """A shallow clone has no origin/main. That must not read as green."""
        self.base_with(["alpha"])
        self.assertEqual(self.run_check("--base", "origin/does-not-exist"), cvr.EXIT_UNRUN)

    def test_missing_head_ref_is_unrun_not_pass(self) -> None:
        self.base_with(["alpha"])
        self.assertEqual(self.run_check("--head", "refs/nope"), cvr.EXIT_UNRUN)

    def test_empty_base_is_unrun_not_pass(self) -> None:
        """An empty base would make every catalogue look like growth."""
        (self.repo / "README.md").write_text("no ventures here\n")
        self.commit("empty base")
        git(self.repo, "update-ref", "refs/remotes/origin/main", "HEAD")
        self.assertEqual(self.run_check(), cvr.EXIT_UNRUN)

    def test_unreadable_launched_json_is_unrun_not_pass(self) -> None:
        self.base_with(["alpha"])
        (self.repo / "platform" / "pages" / "launched.json").write_text("{not json")
        self.commit("corrupt the registry")
        self.assertEqual(self.run_check(), cvr.EXIT_UNRUN)


class RealRepositoryTest(unittest.TestCase):
    """The checker must agree with this repository's actual catalogue.

    A guard that only ever passes on fixtures is the failure mode CLAUDE.md
    records against `platform/proposal/`: correct, unrun, and trusted.
    """

    def test_this_repository_reads_a_catalogue(self) -> None:
        ventures = cvr.ventures_in_worktree()
        launched = cvr.launched_in_worktree()
        self.assertGreater(len(ventures), 100, "ventures/ should hold the catalogue")
        self.assertGreater(len(launched), 100, "launched.json should hold the served set")
        # Every launched slug must be a real venture directory. If this fails,
        # the front door is advertising a tool that has no manifest.
        self.assertEqual(sorted(launched - set(ventures)), [])


if __name__ == "__main__":
    unittest.main()
