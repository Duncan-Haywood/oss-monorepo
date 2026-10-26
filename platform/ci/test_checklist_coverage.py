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

    def test_finds_a_block_whose_fence_opens_the_text(self):
        text = "```\nnode platform/marketing/regen.mjs\n```\n"
        self.assertEqual(cc.read_checklist_block(text), "```\nnode platform/marketing/regen.mjs\n")

    def test_returns_none_when_the_marker_sits_outside_any_fence(self):
        self.assertIsNone(cc.read_checklist_block("node platform/marketing/regen.mjs\n```\n"))


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

    def test_gap_message_is_singular_for_one_directory_and_plural_for_two(self):
        import contextlib
        import io
        import tempfile

        def report(dirs):
            with tempfile.TemporaryDirectory() as td:
                tmp_path = Path(td)
                claude_md = self._write_repo(tmp_path, dirs)
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    cc.main(["--claude-md", str(claude_md), "--repo-root", str(tmp_path)])
            return buf.getvalue()

        self.assertIn("does not name 1 directory that carries", report(["platform/unlisted"]))
        self.assertIn("does not name 2 directories that carry",
                      report(["platform/unlisted", "platform/other"]))

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
        claude_md_path = cc.REPO_ROOT / ".github" / "prompts" / "verify-and-merge.md"
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

    def test_a_lone_angle_bracket_also_ends_the_prefix(self):
        self.assertEqual(cc.literal_prefix("platform/<slug"), "platform")
        self.assertEqual(cc.literal_prefix("platform/slug>/x"), "platform")

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

    def test_hidden_and_vendored_directories_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_py_repo(
                Path(tmp), ["portfolio/ledger", ".hidden/tests", "portfolio/node_modules/x"]
            )
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
        claude_md_path = cc.REPO_ROOT / ".github" / "prompts" / "verify-and-merge.md"
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

    def test_one_repos_checkout_does_not_hide_another_repos_content(self):
        """The cache must not outlive the scan.

        Caught by an automated reviewer on #4646 after it merged. The first
        version keyed a module-level `_cache={}` on the ancestor tuple alone,
        so in a process that scans more than one root -- this suite does --
        a `sweepwt` checkout in the first root made ordinary `sweepwt/**`
        tests in a later root vanish, and reversing the order flipped which
        repo got the wrong answer.

        Silently dropping a directory from the scan is precisely what the
        exclusion exists to prevent, so the fix for it reintroducing that
        failure one layer down is worth a test of its own. Asserted in both
        orders, because a cache bug that only shows up one way round is one a
        single-order test will happily miss.
        """
        import tempfile

        def build(root, nested):
            d = root / "sweepwt" / "platform" / "newthing"
            d.mkdir(parents=True)
            (d / "x.test.mjs").write_text("")
            if nested:
                (root / "sweepwt" / ".git").write_text("gitdir: /elsewhere\n")
            return root

        for first_is_nested in (True, False):
            with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
                first = build(Path(a), nested=first_is_nested)
                second = build(Path(b), nested=not first_is_nested)
                cc.actual_test_mjs_dirs(first)          # poisons a shared cache
                found = cc.actual_test_mjs_dirs(second)
                if first_is_nested:
                    self.assertIn(
                        "sweepwt/platform/newthing", found,
                        "a nested checkout in an earlier repo hid ordinary "
                        "content in a later one",
                    )
                else:
                    self.assertNotIn(
                        "sweepwt/platform/newthing", found,
                        "an earlier repo's ordinary content made a later "
                        "repo's nested checkout get scanned",
                    )

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


WIDENED_TEMPLATE = CHECKLIST_TEMPLATE.replace(
    "node --test ventures/<slug>/*.test.mjs",
    "node --test 'ventures/<slug>/**/*.test.mjs'",
)


def make_venture(root, rel_paths):
    """Create tmp_path/<rel> for each venture-relative test file path."""
    for rel in rel_paths:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("// placeholder\n")
    return root


class GlobTokenToRegex(unittest.TestCase):
    """The matcher has to keep glob semantics exactly, because both directions
    are expensive: too narrow and the 21 subdirectory ventures stay invisible,
    too wide and the check credits a line that does not run anything."""

    def test_placeholder_and_star_stay_inside_one_segment(self):
        m = cc.glob_token_to_regex("ventures/<slug>/*.test.mjs")
        self.assertTrue(m.match("ventures/foo/calc.test.mjs"))
        self.assertFalse(m.match("ventures/foo/test/calc.test.mjs"))
        self.assertFalse(m.match("ventures/foo/bar/baz/calc.test.mjs"))

    def test_doublestar_spans_zero_segments(self):
        # The flat majority must keep matching, or widening the line would
        # trade one silent gap for another.
        m = cc.glob_token_to_regex("ventures/<slug>/**/*.test.mjs")
        self.assertTrue(m.match("ventures/foo/calc.test.mjs"))

    def test_doublestar_spans_one_or_more_segments(self):
        m = cc.glob_token_to_regex("ventures/<slug>/**/*.test.mjs")
        self.assertTrue(m.match("ventures/foo/test/calc.test.mjs"))
        self.assertTrue(m.match("ventures/foo/site/deep/calc.test.mjs"))

    def test_an_unclosed_angle_bracket_is_a_literal_character(self):
        m = cc.glob_token_to_regex("ventures/<slug/*.test.mjs")
        self.assertTrue(m.match("ventures/<slug/calc.test.mjs"))
        self.assertFalse(m.match("ventures/foo/calc.test.mjs"))

    def test_dot_is_literal_not_any_character(self):
        m = cc.glob_token_to_regex("ventures/<slug>/*.test.mjs")
        self.assertFalse(m.match("ventures/foo/calcXtest.mjs"))


class VentureGlobGaps(unittest.TestCase):
    def test_subdirectory_suite_is_a_gap_under_the_narrow_glob(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_venture(
                Path(td), ["ventures/photo-licence/test/app.test.mjs"]
            )
            gaps, tokens = cc.find_venture_glob_gaps(CHECKLIST_TEMPLATE, root)
        self.assertEqual(list(gaps), ["photo-licence"])
        self.assertEqual(tokens, ["ventures/<slug>/*.test.mjs"])

    def test_widening_the_line_closes_the_gap(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_venture(
                Path(td), ["ventures/photo-licence/test/app.test.mjs"]
            )
            gaps, _ = cc.find_venture_glob_gaps(WIDENED_TEMPLATE, root)
        self.assertEqual(gaps, {})

    def test_flat_suite_is_never_a_gap_either_way(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_venture(Path(td), ["ventures/podcast/calc.test.mjs"])
            narrow, _ = cc.find_venture_glob_gaps(CHECKLIST_TEMPLATE, root)
            wide, _ = cc.find_venture_glob_gaps(WIDENED_TEMPLATE, root)
        self.assertEqual(narrow, {})
        self.assertEqual(wide, {})

    def test_a_venture_with_both_layouts_is_still_reported(self):
        # Half-covered must not read as covered: the flat file matching is
        # exactly what would hide the subdirectory one.
        with tempfile.TemporaryDirectory() as td:
            root = make_venture(
                Path(td),
                [
                    "ventures/mixed/calc.test.mjs",
                    "ventures/mixed/site/page.test.mjs",
                ],
            )
            gaps, _ = cc.find_venture_glob_gaps(CHECKLIST_TEMPLATE, root)
        self.assertEqual(
            gaps, {"mixed": ["ventures/mixed/site/page.test.mjs"]}
        )

    def test_node_modules_inside_a_venture_is_not_scanned(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_venture(
                Path(td),
                ["ventures/foo/node_modules/dep/thing.test.mjs"],
            )
            gaps, _ = cc.find_venture_glob_gaps(CHECKLIST_TEMPLATE, root)
        self.assertEqual(gaps, {})

    def test_missing_checklist_block_raises(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError):
                cc.find_venture_glob_gaps("no fenced block here", Path(td))

    def test_main_exits_one_and_names_the_venture(self):
        import contextlib
        import io

        with tempfile.TemporaryDirectory() as td:
            root = cc_make(Path(td))
            make_venture(root, ["ventures/photo-licence/test/app.test.mjs"])
            claude_md = root / "CLAUDE.md"
            claude_md.write_text(CHECKLIST_TEMPLATE)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = cc.main(
                    ["--claude-md", str(claude_md), "--repo-root", str(root)]
                )
        self.assertEqual(code, 1)
        self.assertIn("photo-licence", buf.getvalue())
        self.assertIn("# pass 0", buf.getvalue())


class LiveVentureCoverage(unittest.TestCase):
    """As with the two suites above: today's CLAUDE.md must already reach
    today's venture tests, or this guard fails on its own introduction."""

    def test_current_repo_has_no_venture_glob_gap(self):
        gaps, tokens = cc.find_venture_glob_gaps(
            (cc.REPO_ROOT / ".github" / "prompts" / "verify-and-merge.md").read_text(), cc.REPO_ROOT
        )
        self.assertEqual(
            gaps,
            {},
            "CLAUDE.md's venture line cannot reach these ventures' tests; "
            "running the checklist on one of them would print '# pass 0' and "
            f"exit 0: {sorted(gaps)}",
        )
        self.assertTrue(tokens, "the checklist names no ventures/ test glob")
        # Sanity: the scan must actually be finding venture tests, not
        # passing because it looked at nothing.
        self.assertGreater(
            len(cc.actual_venture_test_mjs_files(cc.REPO_ROOT)), 100
        )


if __name__ == "__main__":
    unittest.main()
