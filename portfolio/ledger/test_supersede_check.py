#!/usr/bin/env python3
"""Unit tests for the supersede check.

These build real throwaway repositories rather than mocking `git`. The whole
value of the tool is that its answer is a fact about git rather than a summary
anyone wrote down, and a mocked `git` would test the summary instead -- which is
the failure mode it exists to catch.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import supersede_check
from supersede_check import evaluate, render, significant


def git(cwd, *args):
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def write(cwd, path, content):
    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def write_bytes(cwd, path, content):
    target = Path(cwd) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def commit(cwd, message):
    git(cwd, "add", "-A")
    git(cwd, "commit", "-q", "-m", message)


def commit_at(cwd, message, when):
    """Commit with an explicit committer date, for the recency signal.

    `last_touched` compares committer dates across the two sides, and two
    commits made in the same test run land in the same second -- which reads
    as "neither is newer" and would make the stale-draft tests pass or fail on
    timing rather than on what they assert. `when` is any format git accepts.
    """
    git(cwd, "add", "-A")
    env = dict(os.environ, GIT_COMMITTER_DATE=when, GIT_AUTHOR_DATE=when)
    subprocess.run(
        ["git", "commit", "-q", "-m", message],
        cwd=cwd, check=True, capture_output=True, text=True, env=env,
    )


class RepoFixture(unittest.TestCase):
    """A base commit, a branch off it, and a `main` that moved independently."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = self._tmp.name
        self.addCleanup(self._tmp.cleanup)
        self._cwd = os.getcwd()
        self.addCleanup(os.chdir, self._cwd)

        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "config", "user.name", "Test")
        write(self.repo, "calc.mjs", "export function total(a, b) {\n  return a + b;\n}\n")
        commit(self.repo, "base")
        os.chdir(self.repo)


class TestNotSuperseded(RepoFixture):
    def test_a_feature_only_on_the_branch_is_reported_as_dropped(self):
        """The #1006 shape: a whole new module that main never received."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(input) {\n"
            "  return new URLSearchParams(input).toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "unrelated.md", "Some other work landed meanwhile.\n")
        commit(self.repo, "unrelated main work")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertTrue(any(f.missing_from_base for f in verdict.files))
        self.assertIn("share.mjs", render(verdict, "feature", "main"))

    def test_exit_status_is_nonzero_so_it_can_gate_a_close(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 1
        )

    def test_a_binary_file_change_does_not_crash_the_scan(self):
        """The #2922/#2926 shape: a PR regenerates a `.gz` mirror shard
        alongside its text change. `git show` on a binary blob is not valid
        UTF-8, and `base_tree_lines` used to decode every changed path
        unconditionally -- crashing before the (real, droppable) text
        feature below it was ever compared."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        write_bytes(self.repo, "mirror.gz", bytes([0x1F, 0x8B, 0x08, 0x00, 0x01]))
        commit(self.repo, "add sharing, regenerate mirror")

        git(self.repo, "checkout", "-q", "main")
        write_bytes(self.repo, "mirror.gz", bytes([0x1F, 0x8B, 0x08, 0x00, 0x02]))
        commit(self.repo, "unrelated mirror regeneration")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertTrue(any(f.path == "share.mjs" for f in verdict.files))
        self.assertFalse(any(f.path == "mirror.gz" for f in verdict.files))

    def test_an_edit_to_an_existing_file_still_counts(self):
        """Not every dropped feature arrives as a new file."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n  return a + b;\n}\n"
            "export function compareFeeScenarios(values) {\n  return [50, 75, 100];\n}\n",
        )
        commit(self.repo, "add scenarios")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertFalse(verdict.files[0].missing_from_base)


class TestSuperseded(RepoFixture):
    def test_work_already_merged_into_main_reads_as_safe_to_close(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")
        git(self.repo, "checkout", "-q", "main")
        git(self.repo, "merge", "-q", "--no-ff", "-m", "merge", "feature")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertTrue(verdict.superseded)
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 0
        )

    def test_identical_work_landed_by_a_different_route_reads_as_safe(self):
        """A genuine duplicate: someone else committed the same lines by hand."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "the same thing, committed separately")

        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)

    def test_work_that_landed_under_a_different_filename_is_recognised(self):
        """The tool searches the whole base tree, not just the same path."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "add sharing")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "lib/sharing.mjs", "export function encodeInputs(input) {}\n")
        commit(self.repo, "same work, different home")

        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)

    def test_whitespace_and_punctuation_churn_is_not_treated_as_work(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n\n  return a + b;\n\n}\n\n\n",
        )
        commit(self.repo, "reformat only")
        self.assertTrue(evaluate("feature", "main", fetch=False).superseded)


class TestIdenticalMergeProof(RepoFixture):
    """The second proof: does replaying the branch on main change main at all?

    The line scan cannot see a feature main re-implemented under a different
    filename with different wording, which is how this repository's whole open
    queue came to read NOT SUPERSEDED while none of it was mergeable either.
    """

    def test_a_reworded_reimplementation_on_main_is_recognised(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n  return a + b;\n}\n"
            "export function csvCell(value) {\n"
            "  return /[\",\\n]/.test(value) ? `\"${value}\"` : value;\n"
            "}\n",
        )
        commit(self.repo, "add a CSV cell escaper")

        git(self.repo, "checkout", "-q", "main")
        write(
            self.repo,
            "calc.mjs",
            "export function total(a, b) {\n  return a + b;\n}\n"
            "// Quote a cell a spreadsheet would otherwise split on.\n"
            "export function csvCell(cell) {\n"
            "  const needsQuotes = /[\",\\r\\n]/.test(String(cell));\n"
            "  return needsQuotes ? `\"${String(cell).replaceAll('\"', '\"\"')}\"` : cell;\n"
            "}\n",
        )
        commit(self.repo, "the same escaper, written independently and better")

        verdict = evaluate("feature", "main", fetch=False)
        # The line scan alone cannot see it: nothing matches textually.
        self.assertTrue(any(f.unmatched for f in verdict.files))
        self.assertTrue(verdict.identical_merge)
        self.assertTrue(verdict.superseded)
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 0
        )

    def test_the_report_names_which_proof_fired_and_what_it_folds_in(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(self.repo, "calc.mjs", "export function total(a, b) {\n  return a - b;\n}\n")
        commit(self.repo, "branch changes the operator")
        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "calc.mjs", "export function total(first, second) {\n  return first + second;\n}\n")
        commit(self.repo, "main rewrote the same function")

        text = render(evaluate("feature", "main", fetch=False), "feature", "main")
        self.assertIn("SUPERSEDED (identical-merge proof)", text)
        self.assertIn("re-derivation, not a merge", text)

    def test_a_new_file_main_lacks_survives_the_replay(self):
        """The strategy resolves conflicts, so it cannot swallow a new surface."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(input) {\n"
            "  return new URLSearchParams(input).toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")
        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "unrelated.mjs", "export function somethingElse() {}\n")
        commit(self.repo, "main moves on elsewhere")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.identical_merge)
        self.assertFalse(verdict.superseded)
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 1
        )


class TestShallowClone(unittest.TestCase):
    """A scheduled session's clone is shallow, and that used to defeat the tool.

    Both histories get cut off before they meet, so `git merge-base` exits
    non-zero and every branch reads as unrelated to `main` -- the tool then
    answers "cannot decide" for the whole queue and the caller goes back to
    guessing, which is the one outcome it exists to prevent.
    """

    # The origin is built once: 260-odd commits is the only slow part of this
    # fixture, and every test wants the same history.
    @classmethod
    def setUpClass(cls):
        cls._origin_tmp = tempfile.TemporaryDirectory()
        cls.origin = str(Path(cls._origin_tmp.name) / "origin")
        os.makedirs(cls.origin)
        git(cls.origin, "init", "-q", "-b", "main")
        git(cls.origin, "config", "user.email", "test@example.com")
        git(cls.origin, "config", "user.name", "Test")
        write(cls.origin, "calc.mjs", "export function total(a, b) {\n  return a + b;\n}\n")
        commit(cls.origin, "base")
        # Deeper than the --deepen=200 first attempt, so the fixture exercises
        # the unshallow escalation rather than only the cheap deepen. Empty
        # commits keep them cheap; only their count matters here.
        for n in range(260):
            git(cls.origin, "commit", "-q", "--allow-empty", "-m", f"commit {n}")

        git(cls.origin, "checkout", "-q", "-b", "feature")
        write(cls.origin, "share.mjs", "export function encodeInputs(input) {}\n")
        commit(cls.origin, "add sharing")
        git(cls.origin, "checkout", "-q", "main")
        write(cls.origin, "unrelated.mjs", "export function somethingElse() {}\n")
        commit(cls.origin, "main moves on")

    @classmethod
    def tearDownClass(cls):
        cls._origin_tmp.cleanup()

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._cwd = os.getcwd()
        self.addCleanup(os.chdir, self._cwd)

        # A fresh clone per test: unshallowing mutates the clone, so tests
        # would otherwise stop seeing the shallow state they are about.
        self.clone = str(Path(self._tmp.name) / "clone")
        subprocess.run(
            ["git", "clone", "-q", "--depth", "1", "--no-single-branch",
             f"file://{self.origin}", self.clone],
            check=True, capture_output=True, text=True,
        )
        os.chdir(self.clone)

    def test_the_clone_really_is_shallow(self):
        self.assertTrue(supersede_check.is_shallow())

    def test_a_verdict_is_still_reached_from_a_shallow_clone(self):
        verdict = evaluate("origin/feature", "origin/main")
        self.assertFalse(verdict.superseded)
        self.assertTrue(any("share.mjs" in f.path for f in verdict.files))

    def test_no_fetch_reports_the_missing_ancestor_rather_than_passing(self):
        """Failing closed matters: exit 0 here would greenlight a wrongful close."""
        self.assertEqual(
            supersede_check.main(
                ["origin/feature", "--base", "origin/main", "--no-fetch"]
            ),
            2,
        )


class TestSignificance(unittest.TestCase):
    def test_structural_and_empty_lines_carry_no_evidence(self):
        for line in ["", "   ", "}", "  });", "---", "// ", "'''"]:
            self.assertFalse(significant(line), line)

    def test_short_fragments_match_incidentally_and_are_ignored(self):
        self.assertFalse(significant("let x = 1;"))

    def test_a_real_statement_counts(self):
        self.assertTrue(
            significant("export function compareFeeScenarios(values) {")
        )


class TestRendering(RepoFixture):
    def test_the_report_names_the_lines_that_would_be_lost(self):
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(inputObject) {\n"
            "  return new URLSearchParams(inputObject).toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")

        text = render(evaluate("feature", "main", fetch=False), "feature", "main")
        self.assertIn("NOT SUPERSEDED", text)
        self.assertIn("does not exist on base at all", text)
        self.assertIn("encodeInputs", text)

    def test_an_unknown_ref_is_an_error_rather_than_a_reassuring_pass(self):
        """Failing open here would hand the caller a green light on no evidence."""
        self.assertEqual(
            supersede_check.main(["no-such-branch", "--base", "main", "--no-fetch"]), 2
        )


class TestRenameSuspected(RepoFixture):
    """The #1323 shape: main re-implemented the feature under other identifiers.

    The line scan is exact, so a base that spells the same function
    `largestCostDriver` where the branch spells it `largestCostComponent`
    reports every one of those lines missing. That verdict is literally correct
    and reads as "this branch carries unique work", which is how sessions came
    to hold thirty-odd branches whose features were all already shipped.
    """

    def branch_with_renamed_copy(self):
        """A base with the feature under one name, a branch under another.

        Both files sit inside one venture directory because that is the scope
        a twin is searched in -- see `neighbourhood`.
        """
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "ventures/normalizer/driver.mjs",
            "export function largestCostComponent(result) {\n"
            "  const component = result.components.reduce((largest, name) =>\n"
            "    result.quote[name] > result.quote[largest] ? name : largest,\n"
            "    result.components[0],\n"
            "  );\n"
            "  return { name: component, amount: result.quote[component] };\n"
            "}\n",
        )
        commit(self.repo, "add cost component")

        git(self.repo, "checkout", "-q", "main")
        write(
            self.repo,
            "ventures/normalizer/calc.mjs",
            "export function largestCostDriver(result) {\n"
            "  const component = result.components.reduce((largest, current) =>\n"
            "    result.quote[current] > result.quote[largest] ? current : largest,\n"
            "    result.components[0],\n"
            "  );\n"
            "  return { name: component, amount: result.quote[component] };\n"
            "}\n",
        )
        commit(self.repo, "add cost driver under its own name")

    def test_a_renamed_reimplementation_is_flagged(self):
        self.branch_with_renamed_copy()
        verdict = evaluate("feature", "main", fetch=False)

        self.assertFalse(verdict.superseded)
        self.assertTrue(verdict.rename_suspected)

    def test_the_report_names_the_twin_and_where_it_lives(self):
        """A reader has to be able to go and look; a score alone is not evidence."""
        self.branch_with_renamed_copy()
        text = render(evaluate("feature", "main", fetch=False), "feature", "main")

        self.assertIn("RENAME SUSPECTED", text)
        self.assertIn("largestCostDriver", text)
        self.assertIn("calc.mjs", text)

    def test_a_suspected_rename_still_exits_nonzero(self):
        """Similarity is evidence to read, never a licence to close unread.

        The one word that differs between two 93%-alike lines can be the fix
        the branch exists to make.
        """
        self.branch_with_renamed_copy()
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 1
        )

    def test_genuinely_new_work_is_not_flagged_as_a_rename(self):
        """The direction that matters: #1006 must not read as already-shipped."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "share.mjs",
            "export function encodeInputs(input) {\n"
            "  const params = new URLSearchParams();\n"
            "  for (const [key, value] of Object.entries(input)) {\n"
            "    if (Number.isFinite(value)) params.set(key, String(value));\n"
            "  }\n"
            "  return params.toString();\n"
            "}\n",
        )
        commit(self.repo, "add sharing")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.rename_suspected)
        self.assertNotIn(
            "RENAME SUSPECTED", render(verdict, "feature", "main")
        )

    def test_append_only_records_are_exempt(self):
        """Every reading in usage.yaml resembles every other by construction.

        `local_comparisons: 0` pairs at 95% with `local_comparisons: 1`, which
        is true and says nothing about whether the branch's work exists.
        """
        write(
            self.repo,
            "portfolio/usage/usage.yaml",
            "readings:\n"
            "  - as_of: 2026-08-24\n"
            "    signals:\n"
            "      local_comparisons: 1\n"
            "      shortlist_exported: 4\n"
            "    note: Shipped fixture-backed local comparison and CI warning output.\n",
        )
        commit(self.repo, "a usage reading")

        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "portfolio/usage/usage.yaml",
            "readings:\n"
            "  - as_of: 2026-08-24\n"
            "    signals:\n"
            "      local_comparisons: 1\n"
            "      shortlist_exported: 4\n"
            "    note: Shipped fixture-backed local comparison and CI warning output.\n"
            "  - as_of: 2026-08-25\n"
            "    signals:\n"
            "      local_comparisons: 0\n"
            "      reports_exported: 0\n"
            "    note: Shipped fixture-backed local comparison; demand remains untested.\n",
        )
        commit(self.repo, "another reading")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.superseded)
        self.assertFalse(verdict.rename_suspected)


class TestStaleDraft(RepoFixture):
    """A branch that is an older draft of what the base already says.

    The shape neither existing proof catches, taken from
    `marketing/vs-smartmoving-moving-bid-calculator`: the branch wrote a
    comparison page, a sibling session rewrote the same page on `main` five
    minutes later, and the branch's now-thinner wording is genuinely absent
    from the base -- so the line scan says NOT SUPERSEDED and the merge replay
    cannot produce the base's tree. Both are right, and merging it anyway
    reverts the better copy.
    """

    PAGE = "ventures/mover/vs-smartmoving.html"

    SHARD = "gitops/prod/front-door-tools/mover__vs-smartmoving.html"

    def draft_then_rewrite(self, *, rewrite=True):
        """Branch drafts the page on day 2; `main` rewrites it on day 3.

        The branch also publishes a mirror shard, because without it the
        identical-merge proof answers first and answers correctly: a branch
        whose *every* file the base rewrote replays into the base's own tree,
        which is already reported as SUPERSEDED. The real branch escaped that
        proof by adding one shard at a path the base has since renamed to
        `.gz` -- a clean add, so the replayed tree differs -- and it is that
        shape, a stale redraft riding along with one file the replay keeps,
        that reaches the verdict this report exists to annotate.
        """
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            self.PAGE,
            "<p>SmartMoving is all-in-one CRM software for moving firms.</p>\n"
            "<p>This calculator prices one local move before you quote.</p>\n"
            "<p>It runs free in any browser and keeps no account at all.</p>\n"
            "<p>Not affiliated with SmartMoving, whose trademark it is.</p>\n",
        )
        write(self.repo, self.SHARD, "<p>A mirrored copy of the page above.</p>\n")
        commit_at(self.repo, "draft the comparison page", "2026-09-02T12:00:00")

        git(self.repo, "checkout", "-q", "main")
        if not rewrite:
            return
        write(self.repo, self.SHARD, "<p>A mirrored copy, uncompressed.</p>\n")
        commit_at(self.repo, "mirror the page", "2026-09-02T12:03:00")

        write(
            self.repo,
            self.PAGE,
            "<p>SmartMoving is all-in-one CRM software for moving companies.</p>\n"
            "<p>This calculator prices one local move before you quote it.</p>\n"
            "<p>It runs free in any browser and keeps no account at all, ever.</p>\n"
            "<p>Not affiliated with SmartMoving, whose trademark that is.</p>\n",
        )
        # The rename that leaves the base with history for the shard path but
        # no file there -- exactly what gzipping the mirror did on `main`.
        os.remove(Path(self.repo) / self.SHARD)
        write(self.repo, self.SHARD + ".gz", "<p>A mirrored copy, compressed.</p>\n")
        commit_at(self.repo, "rewrite the page, gzip the mirror", "2026-09-02T12:05:00")

    def test_an_older_draft_of_a_page_the_base_rewrote_is_flagged(self):
        self.draft_then_rewrite()
        verdict = evaluate("feature", "main", fetch=False)

        self.assertFalse(verdict.superseded)
        self.assertTrue(verdict.stale_draft_suspected)

    def test_it_is_reported_as_a_redraft_rather_than_a_rename(self):
        """The twin is in the same file, which is not what a rename means.

        `nearest_in_base` searches a whole venture directory because a renamed
        feature lives in a *different* file. Counting a same-file twin as a
        rename would tell the reader to go and find work that is not there.
        """
        self.draft_then_rewrite()
        verdict = evaluate("feature", "main", fetch=False)

        self.assertFalse(verdict.rename_suspected)
        page = next(f for f in verdict.files if f.path == self.PAGE)
        self.assertEqual(page.renamed_twins, [])
        self.assertGreaterEqual(len(page.redraft_twins), 3)

    def test_a_suspected_stale_draft_still_exits_nonzero(self):
        """Advisory, exactly like the rename report.

        An older draft can still carry the one fix the branch exists to make,
        so this reports evidence and leaves the gate shut.
        """
        self.draft_then_rewrite()
        self.assertEqual(
            supersede_check.main(["feature", "--base", "main", "--no-fetch"]), 1
        )

    def test_the_report_pairs_each_line_with_the_base_wording(self):
        """A reader must be able to compare; a verdict alone is not evidence."""
        self.draft_then_rewrite()
        text = render(evaluate("feature", "main", fetch=False), "feature", "main")

        self.assertIn("STALE DRAFT SUSPECTED", text)
        # Both halves of one pair, so the reader can see what changed and
        # judge which reading is the better one.
        self.assertIn("before you quote.", text)     # the branch's wording
        self.assertIn("before you quote it.", text)  # the base's, beside it

    def test_genuinely_new_work_is_not_called_a_stale_draft(self):
        """The direction that matters: a real feature must still read as work.

        The base has never had this file, so there is nothing it could be a
        later draft of, however recently the base committed elsewhere.
        """
        git(self.repo, "checkout", "-q", "-b", "feature")
        write(
            self.repo,
            "ventures/mover/share.mjs",
            "export function encodeInputs(input) {\n"
            "  const params = new URLSearchParams();\n"
            "  for (const [key, value] of Object.entries(input)) {\n"
            "    if (Number.isFinite(value)) params.set(key, String(value));\n"
            "  }\n"
            "  return params.toString();\n"
            "}\n",
        )
        commit_at(self.repo, "add sharing", "2026-09-02T12:00:00")

        git(self.repo, "checkout", "-q", "main")
        write(self.repo, "ventures/mover/index.html", "<p>An unrelated edit here.</p>\n")
        commit_at(self.repo, "unrelated later commit", "2026-09-03T12:00:00")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.stale_draft_suspected)
        self.assertNotIn(
            "STALE DRAFT SUSPECTED", render(verdict, "feature", "main")
        )

    def test_recency_alone_is_not_enough(self):
        """`main` moves constantly here, so "it moved later" is true of almost
        every branch. Without twins in the same file it is not evidence."""
        self.draft_then_rewrite(rewrite=False)
        write(
            self.repo,
            self.PAGE,
            "<p>SmartMoving is all-in-one CRM software for moving firms.</p>\n"
            "<p>This calculator prices one local move before you quote.</p>\n"
            "<p>It runs free in any browser and keeps no account at all.</p>\n"
            "<p>Not affiliated with SmartMoving, whose trademark it is.</p>\n"
            "<p>A wholly separate paragraph about something else entirely.</p>\n",
        )
        commit_at(self.repo, "append, do not rewrite", "2026-09-03T12:00:00")

        verdict = evaluate("feature", "main", fetch=False)
        # The base absorbed the branch's own lines, so nothing is unmatched and
        # the branch reads as superseded outright -- never as a stale draft.
        self.assertFalse(verdict.stale_draft_suspected)

    def test_a_branch_newer_than_the_base_is_not_a_stale_draft(self):
        """Same twins, opposite order: here the branch is the later wording."""
        git(self.repo, "checkout", "-q", "-b", "feature")
        git(self.repo, "checkout", "-q", "main")
        write(
            self.repo,
            self.PAGE,
            "<p>SmartMoving is all-in-one CRM software for moving companies.</p>\n"
            "<p>This calculator prices one local move before you quote it.</p>\n"
            "<p>It runs free in any browser and keeps no account at all, ever.</p>\n"
            "<p>Not affiliated with SmartMoving, whose trademark that is.</p>\n",
        )
        commit_at(self.repo, "base writes the page first", "2026-09-02T12:00:00")

        git(self.repo, "checkout", "-q", "feature")
        write(
            self.repo,
            self.PAGE,
            "<p>SmartMoving is all-in-one CRM software for moving firms.</p>\n"
            "<p>This calculator prices one local move before you quote.</p>\n"
            "<p>It runs free in any browser and keeps no account at all.</p>\n"
            "<p>Not affiliated with SmartMoving, whose trademark it is.</p>\n",
        )
        commit_at(self.repo, "branch revises it later", "2026-09-03T12:00:00")

        verdict = evaluate("feature", "main", fetch=False)
        self.assertFalse(verdict.stale_draft_suspected)


class TestNeighbourhood(unittest.TestCase):
    """Where a renamed twin is looked for."""

    def test_a_venture_directory_is_the_search_scope(self):
        self.assertEqual(
            supersede_check.neighbourhood([
                "ventures/quote-margin-check/site/csv.mjs",
                "ventures/quote-margin-check/README.md",
            ]),
            ["ventures/quote-margin-check"],
        )

    def test_shallow_paths_contribute_their_own_directory(self):
        self.assertEqual(
            supersede_check.neighbourhood(["platform/build.mjs"]), ["platform"]
        )

    def test_a_repository_root_file_has_no_neighbourhood(self):
        """Searching the whole tree pairs a calculator with an unrelated one."""
        self.assertEqual(supersede_check.neighbourhood(["README.md"]), [])


if __name__ == "__main__":
    unittest.main()
