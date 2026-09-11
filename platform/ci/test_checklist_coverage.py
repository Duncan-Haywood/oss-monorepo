#!/usr/bin/env python3
"""Tests for checklist_coverage.py.

The failure this guards against is specific: a `platform/<new-thing>/` test
directory appears, and CLAUDE.md's merge checklist -- which names directories
literally, one `node --test` line per directory, rather than a glob that
would auto-discover new ones -- does not mention it. So most of these tests
build exactly that shape rather than testing the happy path alone.
"""

import tempfile
import textwrap
import unittest
from pathlib import Path

import checklist_coverage as cc

CHECKLIST_TEMPLATE = """
Some prose before.

```
node platform/marketing/regen.mjs        # then commit whatever it rewrites
node --test platform/marketing/*.test.mjs platform/pages/*.test.mjs
node --test platform/proposal/*.test.mjs
node --test platform/privacy/*.test.mjs platform/webcheck/*.test.mjs
node --test ventures/<slug>/*.test.mjs
python3 -m pytest gitops/tests -q        # gitops/, platform/ci/, or ANY new venture
(cd platform/ci && for m in test_*.py; do python3 -m unittest "${m%.py}" || break; done)
```

Some prose after.
"""


def make_repo(tmp_path, test_dirs):
    """Create tmp_path/<dir>/whatever.test.mjs for each dir in test_dirs."""
    for d in test_dirs:
        p = tmp_path / d
        p.mkdir(parents=True, exist_ok=True)
        (p / "sample.test.mjs").write_text("// placeholder\n")
    return tmp_path


def cc_make(root):
    """A minimal repo whose disk state matches today's real, fully covered shape."""
    return make_repo(
        root,
        [
            "platform/marketing",
            "platform/pages",
            "platform/proposal",
            "platform/privacy",
            "platform/webcheck",
        ],
    )


class ReadChecklistBlock(unittest.TestCase):
    def test_finds_the_fenced_block(self):
        block = cc.read_checklist_block(CHECKLIST_TEMPLATE)
        self.assertIsNotNone(block)
        self.assertIn("regen.mjs", block)
        self.assertIn("platform/webcheck", block)

    def test_returns_none_when_marker_absent(self):
        self.assertIsNone(cc.read_checklist_block("nothing relevant here"))


class ChecklistDirectories(unittest.TestCase):
    def test_extracts_every_named_directory(self):
        block = cc.read_checklist_block(CHECKLIST_TEMPLATE)
        dirs = cc.checklist_directories(block)
        self.assertEqual(
            dirs,
            {
                "platform/marketing",
                "platform/pages",
                "platform/proposal",
                "platform/privacy",
                "platform/webcheck",
                "ventures/<slug>",
            },
        )


class FindGaps(unittest.TestCase):
    def test_no_gap_when_every_disk_directory_is_named(self):
        # This is today's real shape: five platform/* directories, all named.
        with self._tmp_repo(
            [
                "platform/marketing",
                "platform/pages",
                "platform/proposal",
                "platform/privacy",
                "platform/webcheck",
            ]
        ) as repo_root:
            gaps, checklist_dirs, disk_dirs = cc.find_gaps(
                CHECKLIST_TEMPLATE, repo_root
            )
        self.assertEqual(gaps, [])
        self.assertEqual(len(disk_dirs), 5)

    def test_new_platform_directory_is_reported_as_a_gap(self):
        # The exact recurring shape: a sixth platform/* test dir appears and
        # the checklist (unchanged) does not mention it.
        with self._tmp_repo(
            [
                "platform/marketing",
                "platform/pages",
                "platform/proposal",
                "platform/privacy",
                "platform/webcheck",
                "platform/newthing",
            ]
        ) as repo_root:
            gaps, _, _ = cc.find_gaps(CHECKLIST_TEMPLATE, repo_root)
        self.assertEqual(gaps, ["platform/newthing"])

    def test_ventures_are_never_reported_as_a_gap(self):
        # ventures/<slug> is a standing placeholder, not a literal directory;
        # a real venture directory must not trip the guard.
        with self._tmp_repo(["ventures/some-calculator"]) as repo_root:
            gaps, _, _ = cc.find_gaps(CHECKLIST_TEMPLATE, repo_root)
        self.assertEqual(gaps, [])

    def test_missing_checklist_block_raises(self):
        with self._tmp_repo(["platform/marketing"]) as repo_root:
            with self.assertRaises(ValueError):
                cc.find_gaps("no checklist here at all", repo_root)

    def test_nested_test_file_under_a_named_directory_is_covered(self):
        # A checklist entry for platform/pages covers platform/pages itself;
        # it should not also demand a separate line for a subdirectory of it.
        with self._tmp_repo(["platform/pages/subdir"]) as repo_root:
            gaps, _, _ = cc.find_gaps(CHECKLIST_TEMPLATE, repo_root)
        self.assertEqual(gaps, [])

    def _tmp_repo(self, test_dirs):
        import contextlib
        import tempfile

        @contextlib.contextmanager
        def _ctx():
            with tempfile.TemporaryDirectory() as td:
                yield make_repo(Path(td), test_dirs)

        return _ctx()


class MainCli(unittest.TestCase):
    def _write_repo(self, tmp_path, test_dirs, checklist_text=CHECKLIST_TEMPLATE):
        make_repo(tmp_path, test_dirs)
        claude_md = tmp_path / "CLAUDE.md"
        claude_md.write_text(checklist_text)
        return claude_md

    def test_exit_zero_when_covered(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            claude_md = self._write_repo(tmp_path, ["platform/marketing"])
            rc = cc.main(
                ["--claude-md", str(claude_md), "--repo-root", str(tmp_path)]
            )
        self.assertEqual(rc, 0)

    def test_exit_one_when_gap_present(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            claude_md = self._write_repo(
                tmp_path, ["platform/marketing", "platform/unlisted"]
            )
            rc = cc.main(
                ["--claude-md", str(claude_md), "--repo-root", str(tmp_path)]
            )
        self.assertEqual(rc, 1)

    def test_exit_two_when_checklist_block_missing(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            claude_md = self._write_repo(
                tmp_path, ["platform/marketing"], checklist_text="nothing here"
            )
            rc = cc.main(
                ["--claude-md", str(claude_md), "--repo-root", str(tmp_path)]
            )
        self.assertEqual(rc, 2)


class AgainstTheRealRepo(unittest.TestCase):
    """The one test that is allowed to depend on this actual checkout. It is
    the point of the tool: today's CLAUDE.md must already cover today's
    disk state, or the guard would be failing CI on its own introduction."""

    def test_current_repo_has_no_gap(self):
        claude_md_path = cc.REPO_ROOT / "CLAUDE.md"
        gaps, checklist_dirs, disk_dirs = cc.find_gaps(
            claude_md_path.read_text(), cc.REPO_ROOT
        )
        self.assertEqual(
            gaps,
            [],
            f"CLAUDE.md's checklist does not name: {gaps} -- "
            "add a `node --test <dir>/*.test.mjs` line for each, in the same "
            "commit that added the tests.",
        )
        # Sanity: this should actually be exercising something, not silently
        # finding zero directories on both sides.
        self.assertGreaterEqual(len(disk_dirs), 3)


# ---------------------------------------------------------------------------
# The Python half.
#
# Added 2026-09-06 after enumerating instead of recalling: `find . -name
# 'test_*.py'` returned 54 directories against the 2 the checklist named, and
# four suites in that gap were red -- `portfolio/scoring` and
# `portfolio/router` (four shipped ventures had no score row, so the router
# could not allocate to them) and `portfolio/ledger` (still asserting both
# origins were dark, long after Pages started serving).
# ---------------------------------------------------------------------------

PY_CHECKLIST = CHECKLIST_TEMPLATE.replace(
    '(cd platform/ci && for m in test_*.py; do python3 -m unittest "${m%.py}" || break; done)',
    '(cd platform/ci && for m in test_*.py; do python3 -m unittest "${m%.py}" || break; done)\n'
    "python3 -m pytest portfolio/ledger portfolio/scoring -q\n"
    "python3 -m pytest portfolio/pipeline/probes/<probe> -q",
)


def make_py_repo(tmp_path, test_dirs, addopts=None):
    """Create tmp_path/<dir>/test_sample.py for each dir, plus an optional root
    pyproject.toml carrying pytest addopts."""
    for d in test_dirs:
        p = tmp_path / d
        p.mkdir(parents=True, exist_ok=True)
        (p / "test_sample.py").write_text("# placeholder\n")
    if addopts is not None:
        (tmp_path / "pyproject.toml").write_text(
            "[tool.pytest.ini_options]\n" f'addopts = "{addopts}"\n'
        )
    return tmp_path


class LiteralPrefix(unittest.TestCase):
    def test_stops_at_a_placeholder_or_glob(self):
        self.assertEqual(cc.literal_prefix("ventures/<slug>/*.test.mjs"), "ventures")
        self.assertEqual(
            cc.literal_prefix("platform/privacy/*.test.mjs"), "platform/privacy"
        )

    def test_keeps_a_plain_directory_and_drops_a_filename(self):
        self.assertEqual(cc.literal_prefix("gitops/tests"), "gitops/tests")
        self.assertEqual(cc.literal_prefix("portfolio/ledger/README.md"), "portfolio/ledger")


class PythonGaps(unittest.TestCase):
    def test_an_unnamed_python_directory_is_a_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(Path(tmp), ["portfolio/ledger", "portfolio/brand-new"])
            gaps, _, _ = cc.find_py_gaps(PY_CHECKLIST, root)
            self.assertEqual(gaps, ["portfolio/brand-new"])

    def test_a_named_python_directory_is_covered(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(Path(tmp), ["portfolio/ledger", "portfolio/scoring"])
            gaps, _, _ = cc.find_py_gaps(PY_CHECKLIST, root)
            self.assertEqual(gaps, [])

    def test_ventures_are_covered_by_the_standing_placeholder(self):
        # The `.mjs` scan excludes ventures/ in code; the Python scan does not,
        # relying on the checklist's `ventures/<slug>/` placeholder instead, so
        # the exclusion is stated once rather than twice.
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(Path(tmp), ["ventures/some-tool/tests"])
            gaps, _, _ = cc.find_py_gaps(PY_CHECKLIST, root)
            self.assertEqual(gaps, [])

    def test_a_parent_line_does_not_cover_a_root_ignored_tree(self):
        # The regression this exists for: the root pyproject ignores
        # portfolio/pipeline/probes, so `pytest portfolio/pipeline` collects
        # none of it. Crediting the parent line would report coverage that does
        # not run -- the exact silent failure this script prevents elsewhere.
        checklist = PY_CHECKLIST.replace(
            "python3 -m pytest portfolio/pipeline/probes/<probe> -q",
            "python3 -m pytest portfolio/pipeline -q",
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(
                Path(tmp),
                ["portfolio/pipeline", "portfolio/pipeline/probes/a-probe"],
                addopts="--ignore=portfolio/pipeline/probes",
            )
            gaps, _, _ = cc.find_py_gaps(checklist, root)
            self.assertEqual(gaps, ["portfolio/pipeline/probes/a-probe"])

    def test_naming_the_ignored_tree_itself_does_cover_it(self):
        # PY_CHECKLIST names `portfolio/pipeline/probes/<probe>` but not
        # `portfolio/pipeline`, so only the probe directory exists here --
        # the point is that a line at the ignored tree does reach inside it.
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(
                Path(tmp),
                ["portfolio/pipeline/probes/a-probe"],
                addopts="--ignore=portfolio/pipeline/probes",
            )
            gaps, _, _ = cc.find_py_gaps(PY_CHECKLIST, root)
            self.assertEqual(gaps, [])

    def test_root_ignored_trees_are_read_from_pyproject(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(Path(tmp), [], addopts="--ignore=a/b --ignore=c")
            self.assertEqual(cc.root_ignored_trees(root), {"a/b", "c"})

    def test_no_pyproject_means_no_ignored_trees(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(cc.root_ignored_trees(Path(tmp)), set())


class LivePythonCoverage(unittest.TestCase):
    def test_current_repo_has_no_python_gap(self):
        claude_md_path = cc.REPO_ROOT / "CLAUDE.md"
        gaps, _, disk_dirs = cc.find_py_gaps(claude_md_path.read_text(), cc.REPO_ROOT)
        self.assertEqual(
            gaps,
            [],
            f"CLAUDE.md's checklist does not name: {gaps} -- add a pytest line "
            "for each, in the same commit that added the tests.",
        )
        # This repo carries dozens; if it ever reads as a handful the scan has
        # broken rather than the repo having shrunk.
        self.assertGreaterEqual(len(disk_dirs), 20)

    def test_the_live_root_pyproject_still_ignores_the_probes(self):
        # If this stops being true the probes become root-collectible and the
        # placeholder line should be replaced with a real one.
        self.assertIn(
            "portfolio/pipeline/probes", cc.root_ignored_trees(cc.REPO_ROOT)
        )


class NestedCheckout(unittest.TestCase):
    """A git worktree inside the repo must not be scanned as repo content.

    CLAUDE.md tells sessions to `git worktree add` -- for a supersession check,
    and to read `main` without disturbing their own tree. A worktree is a
    second complete copy of every file, untracked by the outer repo, so
    without an exclusion this checker finds all 65 test directories twice and
    fails with 65 findings naming paths like `sweepwt/portfolio/ledger/`,
    each instructing the reader to add a line to CLAUDE.md.

    Measured 2026-09-11 on a session that had a browser sweep running in
    `./sweepwt`. It is wrong in the expensive direction: a guard that cries
    wolf is one a reader learns to wave through, and being believed the one
    time a genuinely uncovered directory appears is this guard's entire job.
    """

    def _repo_with_nested_checkout(self, dot_git_is_file):
        import contextlib
        import tempfile

        @contextlib.contextmanager
        def _ctx():
            with tempfile.TemporaryDirectory() as td:
                root = cc_make(Path(td))
                nested = root / "sweepwt"
                (nested / "platform" / "marketing").mkdir(parents=True)
                (nested / "platform" / "marketing" / "a.test.mjs").write_text("")
                (nested / "platform" / "newthing").mkdir(parents=True)
                (nested / "platform" / "newthing" / "b.test.mjs").write_text("")
                (nested / "portfolio" / "ledger").mkdir(parents=True)
                (nested / "portfolio" / "ledger" / "test_x.py").write_text("")
                if dot_git_is_file:
                    # What `git worktree add` writes: a file pointing at the
                    # parent's .git/worktrees/<name>.
                    (nested / ".git").write_text("gitdir: /repo/.git/worktrees/sweepwt\n")
                else:
                    (nested / ".git").mkdir()
                yield root

        return _ctx()

    def test_a_linked_worktree_is_not_scanned(self):
        with self._repo_with_nested_checkout(dot_git_is_file=True) as repo_root:
            gaps, _, disk_dirs = cc.find_gaps(CHECKLIST_TEMPLATE, repo_root)
        self.assertEqual(gaps, [], "a nested worktree was scanned as repo content")
        self.assertNotIn("sweepwt/platform/newthing", disk_dirs)

    def test_a_nested_clone_or_submodule_is_not_scanned_either(self):
        # Detected by the presence of `.git`, not by name, so a stray clone
        # someone left in the tree is covered by the same rule.
        with self._repo_with_nested_checkout(dot_git_is_file=False) as repo_root:
            gaps, _, disk_dirs = cc.find_gaps(CHECKLIST_TEMPLATE, repo_root)
        self.assertEqual(gaps, [])
        self.assertNotIn("sweepwt/portfolio/ledger", disk_dirs)

    def test_the_same_directory_outside_a_checkout_is_still_a_gap(self):
        # The exclusion must be about the nested checkout, not about the name:
        # an uncovered directory that merely sits deeper still has to report.
        import contextlib
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            root = cc_make(Path(td))
            (root / "platform" / "newthing").mkdir(parents=True)
            (root / "platform" / "newthing" / "b.test.mjs").write_text("")
            gaps, _, _ = cc.find_gaps(CHECKLIST_TEMPLATE, root)
        self.assertTrue(
            any("platform/newthing" in g for g in gaps),
            "the exclusion swallowed a real gap",
        )


if __name__ == "__main__":
    unittest.main()
