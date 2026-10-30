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

import contextlib
import io
import sys
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


class OptoutCountViaNode(unittest.TestCase):
    """`optout_switch_count` shells out to Node; pin how it reads the result."""

    def _run(self, proc):
        calls = []

        def fake(*args, **kwargs):
            calls.append(kwargs)
            return proc

        real = sync.subprocess.run
        sync.subprocess.run = fake
        self.addCleanup(setattr, sync.subprocess, "run", real)
        return calls

    def test_a_clean_run_returns_the_reported_count(self):
        import subprocess

        calls = self._run(subprocess.CompletedProcess([], 0, stdout='noise\n{"count": 7}\n', stderr=""))
        self.assertEqual(sync.optout_switch_count(), 7)
        # Output must be captured as text, or stdout is None / bytes.
        self.assertIs(calls[0]["capture_output"], True)
        self.assertIs(calls[0]["text"], True)

    def test_a_nonzero_exit_is_a_derivation_error_not_a_count(self):
        import subprocess

        self._run(subprocess.CompletedProcess([], 1, stdout='{"count": 7}', stderr="boom"))
        with self.assertRaises(sync.DerivationError):
            sync.optout_switch_count()

    def test_unparseable_output_is_a_derivation_error(self):
        import subprocess

        self._run(subprocess.CompletedProcess([], 0, stdout="not json", stderr=""))
        with self.assertRaises(sync.DerivationError):
            sync.optout_switch_count()


class MultiGroupAndMain(ApplyBase):
    def test_every_group_in_one_match_is_rewritten(self):
        path = self.write("doc.md", "mirrors 12 of the 12 tools directly\n")
        site = sync.Site("doc.md", r"mirrors (\d+) of the (\d+) tools directly", "N of N")
        sync.apply([site], 14, write=True)
        self.assertEqual(path.read_text(), "mirrors 14 of the 14 tools directly\n")

    def test_a_pattern_with_no_group_is_left_untouched(self):
        path = self.write("doc.md", "mirrors 12 tools\n")
        sync.apply([sync.Site("doc.md", r"mirrors 12 tools", "no group")], 14, write=True)
        self.assertEqual(path.read_text(), "mirrors 12 tools\n")

    def test_a_site_expects_exactly_one_match_by_default(self):
        self.assertEqual(sync.Site("a", "b", "c").expected, 1)

    def test_main_exits_2_when_a_derivation_fails(self):
        def boom():
            raise sync.DerivationError("x")

        real = sync.mirrored_tool_count
        sync.mirrored_tool_count = boom
        self.addCleanup(setattr, sync, "mirrored_tool_count", real)
        old = sys.argv
        sys.argv = ["sync_tree_counts.py", "--check"]
        self.addCleanup(setattr, sys, "argv", old)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sync.main(), 2)

    def test_main_refuses_a_derived_zero_with_exit_2(self):
        real = (sync.mirrored_tool_count, sync.optout_switch_count)
        sync.mirrored_tool_count = lambda: 0
        sync.optout_switch_count = lambda: 5
        self.addCleanup(lambda: (setattr(sync, "mirrored_tool_count", real[0]), setattr(sync, "optout_switch_count", real[1])))
        old = sys.argv
        sys.argv = ["sync_tree_counts.py", "--check"]
        self.addCleanup(setattr, sys, "argv", old)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sync.main(), 2)

    def _run_main(self, *flags):
        real = (sync.mirrored_tool_count, sync.optout_switch_count,
                sync.MIRRORED_SITES, sync.OPTOUT_SITES)
        sync.mirrored_tool_count = lambda: 3
        sync.optout_switch_count = lambda: 4
        sync.MIRRORED_SITES = [sync.Site("doc.md", r"mirrors (\d+) tools", "tools")]
        sync.OPTOUT_SITES = []
        self.addCleanup(lambda: (
            setattr(sync, "mirrored_tool_count", real[0]),
            setattr(sync, "optout_switch_count", real[1]),
            setattr(sync, "MIRRORED_SITES", real[2]),
            setattr(sync, "OPTOUT_SITES", real[3])))
        old = sys.argv
        sys.argv = ["sync_tree_counts.py", *flags]
        self.addCleanup(setattr, sys, "argv", old)
        with contextlib.redirect_stdout(io.StringIO()):
            return sync.main()

    def test_check_exits_1_on_drift_and_writes_nothing(self):
        path = self.write("doc.md", "mirrors 12 tools\n")
        self.assertEqual(self._run_main("--check"), 1)
        self.assertEqual(path.read_text(), "mirrors 12 tools\n")

    def test_rewrite_exits_0_and_fixes_the_number(self):
        path = self.write("doc.md", "mirrors 12 tools\n")
        self.assertEqual(self._run_main(), 0)
        self.assertEqual(path.read_text(), "mirrors 3 tools\n")

    def test_in_sync_exits_0(self):
        self.write("doc.md", "mirrors 3 tools\n")
        self.assertEqual(self._run_main("--check"), 0)

    def test_a_reworded_sentence_fails_even_when_nothing_drifted(self):
        self.write("doc.md", "reworded\n")
        self.assertEqual(self._run_main("--check"), 1)


if __name__ == "__main__":
    unittest.main()
