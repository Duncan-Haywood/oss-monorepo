"""Tests for sync_tree_counts.py.

The tests that matter here are the ones proving this script can be WRONG
safely. It rewrites committed files, so its failure modes are worse than
missing a drift: it can write a number nobody checked, or silently stop
matching a sentence and report "in sync" about prose it is no longer reading.

Both of those already happened while it was being written, which is why they
are pinned rather than imagined:

  - the first draft filtered the opt-out results on a status string that does
    not exist, derived 0, and reported DRIFT saying the tree had zero
    switches. Under `--check` that was a wrong report; without it, it would
    have rewritten the constant to 0 and turned a green tree red.
  - the "sentence no longer matches" case is the one this whole script is
    supposed to remove, so a version of it that shrugged at a reworded
    sentence would reintroduce the defect at one remove.
"""

import tempfile
import unittest
from pathlib import Path

# Bare-name import with `platform/ci` as the working directory, the same way
# every other test module in this directory imports its subject (see
# CLAUDE.md: these resolve only with `platform/ci` as cwd, which is why the
# checklist `cd`s before running them).
import sync_tree_counts as sync


class ApplyBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self._real_repo = sync.REPO
        sync.REPO = self.root
        self.addCleanup(self._restore)

    def _restore(self):
        sync.REPO = self._real_repo
        self._tmp.cleanup()

    def write(self, rel, text):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path


class DriftDetection(ApplyBase):
    def test_a_stale_number_is_reported_as_drift(self):
        self.write("doc.md", "it mirrors 12 of the 12 tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")
        drifted, problems = sync.apply([site], 14, write=False)

        self.assertEqual(problems, [])
        self.assertEqual(len(drifted), 1)
        self.assertIn("says 12", drifted[0])
        self.assertIn("tree says 14", drifted[0])

    def test_a_matching_number_is_not_reported(self):
        self.write("doc.md", "it mirrors 14 of the 14 tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")
        drifted, problems = sync.apply([site], 14, write=False)

        self.assertEqual(drifted, [])
        self.assertEqual(problems, [])

    def test_check_mode_writes_nothing(self):
        path = self.write("doc.md", "it mirrors 12 of the 12 tools directly\n")
        before = path.read_text()
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        sync.apply([site], 14, write=False)

        self.assertEqual(path.read_text(), before, "--check must not modify the file")


class Rewriting(ApplyBase):
    def test_a_stale_number_is_rewritten_in_place(self):
        path = self.write("doc.md", "prefix\nit mirrors 12 of the 12 tools directly\nsuffix\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        sync.apply([site], 14, write=True)

        self.assertIn("mirrors 14 of the 12 tools", path.read_text())
        self.assertIn("prefix", path.read_text())
        self.assertIn("suffix", path.read_text())

    def test_only_the_captured_group_changes_not_every_number_on_the_line(self):
        # The replacement swaps the captured digits inside the matched text,
        # so a second number on the same line is left alone. A naive
        # line-level substitution would eat it.
        path = self.write("doc.md", "in 2026 it mirrors 12 of the 12 tools directly, see #4853\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        sync.apply([site], 14, write=True)

        text = path.read_text()
        self.assertIn("in 2026 ", text, "an unrelated year must not be rewritten")
        self.assertIn("#4853", text, "an unrelated issue number must not be rewritten")
        self.assertIn("mirrors 14 of the 12 tools", text)

    def test_rewriting_is_idempotent(self):
        path = self.write("doc.md", "it mirrors 12 of the 12 tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        sync.apply([site], 14, write=True)
        once = path.read_text()
        drifted, problems = sync.apply([site], 14, write=True)

        self.assertEqual(path.read_text(), once)
        self.assertEqual(drifted, [], "a second run must find nothing left to do")
        self.assertEqual(problems, [])

    def test_every_occurrence_in_one_file_is_rewritten(self):
        path = self.write("doc.md", "mirrors 12 of the 12 tools directly\n...\nmirrors 12 of the 12 tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        drifted, _ = sync.apply([site], 14, write=True)

        self.assertEqual(len(drifted), 2, "both occurrences must be reported")
        self.assertNotIn("mirrors 12 of", path.read_text())


class RewordedSentence(ApplyBase):
    """The defect this script exists to remove, reintroduced at one remove.

    If a sentence is reworded, the pattern stops matching. Doing nothing and
    reporting "in sync" would be the worst outcome available: the number would
    stop being maintained with a tool actively reassuring everyone it was.
    """

    def test_a_pattern_that_stops_matching_is_a_reported_problem(self):
        self.write("doc.md", "it now mirrors fourteen tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the \d+ tools directly", "mirrors N")

        drifted, problems = sync.apply([site], 14, write=False)

        self.assertEqual(drifted, [])
        self.assertEqual(len(problems), 1)
        self.assertIn("no longer matches", problems[0])
        self.assertIn("doc.md", problems[0])

    def test_a_missing_file_is_a_reported_problem(self):
        site = sync.Site("nope.md", r"mirrors (\d+) tools", "mirrors N")

        drifted, problems = sync.apply([site], 14, write=False)

        self.assertEqual(drifted, [])
        self.assertEqual(problems, ["nope.md: missing"])


class RealSitePatterns(unittest.TestCase):
    """The configured patterns must match the real files, right now.

    This is the assertion that would have caught the collision by itself: a
    pattern list nobody exercises against the tree is a list that silently
    stops applying.
    """

    def test_every_configured_site_matches_its_real_file(self):
        _, problems = sync.apply(
            sync.MIRRORED_SITES + sync.OPTOUT_SITES,
            # A value nothing can equal, so this exercises matching only and
            # reports drift for every site rather than rewriting anything.
            999999,
            write=False,
        )
        self.assertEqual(problems, [], "a configured sentence no longer matches its file")

    def test_every_configured_site_is_found_at_least_once(self):
        sync.apply(sync.MIRRORED_SITES + sync.OPTOUT_SITES, 999999, write=False)
        for site in sync.MIRRORED_SITES + sync.OPTOUT_SITES:
            self.assertGreater(site.found, 0, f"{site.path}: {site.what} matched nothing")


class Derivation(unittest.TestCase):
    def test_the_mirrored_count_is_plausible_and_imported_not_restated(self):
        # Imported from the guard's own helper. The assertion is deliberately
        # a floor rather than an exact number -- pinning it here would create
        # the very second copy this script exists to avoid.
        count = sync.mirrored_tool_count()
        self.assertGreater(count, 100, "the mirror holds hundreds of tools; a small number means a broken scan")

    def test_a_derivation_failure_raises_rather_than_returning_zero(self):
        self.assertTrue(issubclass(sync.DerivationError, RuntimeError))

        real = sync.REPO
        try:
            sync.REPO = Path(tempfile.gettempdir()) / "definitely-not-the-repo-12345"
            with self.assertRaises(sync.DerivationError):
                sync.mirrored_tool_count()
            with self.assertRaises(sync.DerivationError):
                sync.optout_switch_count()
        finally:
            sync.REPO = real


if __name__ == "__main__":
    unittest.main()
