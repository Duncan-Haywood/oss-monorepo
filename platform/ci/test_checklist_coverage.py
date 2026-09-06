#!/usr/bin/env python3
"""Tests for checklist_coverage.py.

The failure this guards against is specific: a `platform/<new-thing>/` test
directory appears, and CLAUDE.md's merge checklist -- which names directories
literally, one `node --test` line per directory, rather than a glob that
would auto-discover new ones -- does not mention it. So most of these tests
build exactly that shape rather than testing the happy path alone.
"""

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


if __name__ == "__main__":
    unittest.main()
