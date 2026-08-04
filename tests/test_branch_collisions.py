#!/usr/bin/env python3
"""
Tests for the parallel-work collision detector.

The one that matters is `test_shared_history_is_not_a_collision`. A file added
once and inherited by thirty descendant branches looks exactly like thirty
independent creations to a naive count — the first version of this measurement
reported 74 colliding paths for that reason, and the real number is 6. A
detector that cries collision on every branch would be ignored within a day,
which is the same outcome as not having one.

Everything else asserts the failing direction, and the fail-closed direction:
a shallow clone and a missing baseline ref must both refuse to answer rather
than report zero collisions.

No test here is skipped or conditionally skipped, and none should be.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
TESTS_DIR = Path(__file__).resolve().parent
for _path in (str(CI_DIR), str(TESTS_DIR)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import json as _json
import subprocess
import tempfile
import unittest

import branch_collisions
from baseline_trust import STATE_DIVERGED, STATE_UNREACHABLE, verify_baseline
from branch_collisions import (
    MAX_COLLIDING_PATHS,
    BaselineUnverified,
    CollisionError,
    find_collisions,
)
from scratch_remote import ScratchRemote


class GitRepoTestCase(unittest.TestCase):
    """Every repository here has a real bare `origin` in a temp directory.

    These used to write `refs/remotes/origin/main` with `git update-ref` and
    call it a baseline — the same assumption the code made, and the same one a
    hand-written ref exploited. The baseline is now moved by publishing to the
    remote and fetching back, so a test can only "ship" something by shipping
    it. No test pushes anywhere; see `tests/scratch_remote.py`.
    """

    def git(self, *args):
        return self.scratch.git(*args)

    def setUp(self):
        self.scratch = ScratchRemote()
        self.addCleanup(self.scratch.cleanup)
        self.repo = self.scratch.work

    def commit(self, path, text):
        self.scratch.commit(path, text)

    def paths(self):
        return [c.path for c in find_collisions(self.repo)]


class TestCollisionDetection(GitRepoTestCase):
    def test_no_branches_no_collisions(self):
        self.assertEqual(find_collisions(self.repo), [])

    def test_a_file_written_once_is_not_a_collision(self):
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("scripts/ci/thing.py", "v1")
        self.assertEqual(self.paths(), [])

    def test_the_same_path_on_two_branches_is_a_collision(self):
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("scripts/ci/thing.py", "version one")
        self.git("checkout", "-q", "main")
        self.git("checkout", "-q", "-b", "agent/two")
        self.commit("scripts/ci/thing.py", "version two, written independently")
        self.assertEqual(self.paths(), ["scripts/ci/thing.py"])

    def test_a_collision_records_every_creating_commit(self):
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("a.py", "one")
        self.git("checkout", "-q", "main")
        self.git("checkout", "-q", "-b", "agent/two")
        self.commit("a.py", "two")
        self.git("checkout", "-q", "main")
        self.git("checkout", "-q", "-b", "agent/three")
        self.commit("a.py", "three")
        collisions = find_collisions(self.repo)
        self.assertEqual(len(collisions), 1)
        self.assertEqual(collisions[0].versions, 3)
        self.assertEqual(len(set(collisions[0].commits)), 3)

    def test_shared_history_is_not_a_collision(self):
        # The whole point. One creation inherited by many branches is one
        # creation. Counting branches instead of creating commits reported 74
        # collisions here when the true number was 6.
        self.git("checkout", "-q", "-b", "agent/base")
        self.commit("scripts/ci/thing.py", "written once")
        for name in ("agent/a", "agent/b", "agent/c", "agent/d"):
            self.git("checkout", "-q", "agent/base")
            self.git("checkout", "-q", "-b", name)
            self.commit(f"{name.replace('/', '-')}.txt", "unrelated")
        self.assertEqual(self.paths(), [])

    def test_a_file_already_in_the_baseline_is_ignored(self):
        self.commit("shipped.py", "already live")
        self.scratch.publish()
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("other.py", "new")
        self.assertEqual(self.paths(), [])

    def test_collisions_are_ordered_by_severity_then_path(self):
        for i, name in enumerate(("agent/one", "agent/two", "agent/three")):
            self.git("checkout", "-q", "main")
            self.git("checkout", "-q", "-b", name)
            self.commit("zzz.py", f"v{i}")
            if i < 2:
                self.commit("aaa.py", f"v{i}")
        collisions = find_collisions(self.repo)
        self.assertEqual([c.path for c in collisions], ["zzz.py", "aaa.py"])
        self.assertEqual(collisions[0].versions, 3)


class TestFailsClosed(GitRepoTestCase):
    def test_shallow_clone_refuses_to_report_zero(self):
        (self.repo / ".git" / "shallow").write_text("")
        with self.assertRaises(CollisionError) as ctx:
            find_collisions(self.repo)
        self.assertIn("Refusing to report zero", str(ctx.exception))

    def test_missing_baseline_ref_refuses_via_the_remote_check(self):
        # The remote now answers first, and it answers that no such branch
        # exists there. Refused earlier than before, for a better reason.
        with self.assertRaises(BaselineUnverified) as ctx:
            find_collisions(self.repo, "origin/nonexistent")
        self.assertIn("Refusing to report a collision count", str(ctx.exception))

    def test_missing_baseline_ref_still_refuses_without_the_remote_check(self):
        # The original fail-closed path, still intact underneath: even with
        # verification skipped, a baseline that does not resolve locally must
        # not read as "nothing collides".
        with self.assertRaises(CollisionError) as ctx:
            find_collisions(self.repo, "origin/nonexistent", verify=False)
        self.assertIn("Refusing to report zero", str(ctx.exception))


class TestReport(GitRepoTestCase):
    def test_a_clean_repository_reports_a_pass(self):
        text = branch_collisions.format_report(self.repo, [])
        self.assertIn("PASS", text)

    def test_a_collision_report_names_the_path_and_the_commits(self):
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("scripts/ci/thing.py", "one")
        self.git("checkout", "-q", "main")
        self.git("checkout", "-q", "-b", "agent/two")
        self.commit("scripts/ci/thing.py", "two")
        text = branch_collisions.format_report(self.repo, find_collisions(self.repo))
        self.assertIn("scripts/ci/thing.py", text)
        self.assertIn("add scripts/ci/thing.py", text)
        self.assertNotIn("no path was created by two", text)


class TestBaselineTrust(GitRepoTestCase):
    """`origin/main` is a local file here too, and it was read the same way.

    A doctored baseline shrinks this count for the same reason it shrank the
    release-lag one: commits the baseline already contains are not scanned, so
    the duplicates they created stop existing. Real bare remote, real `git`, no
    patching of `verify_baseline` or of `branch_collisions` — a test that stubs
    the module the fix lives in survives the fix being reverted.
    """

    def two_versions_of_one_file(self):
        self.git("checkout", "-q", "-b", "agent/one")
        self.commit("scripts/ci/thing.py", "version one")
        self.git("checkout", "-q", "main")
        self.git("checkout", "-q", "-b", "agent/two")
        self.commit("scripts/ci/thing.py", "version two, written independently")

    def cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CI_DIR / "branch_collisions.py"), "--repo-root", str(self.repo), *args],
            capture_output=True,
            text=True,
        )

    def test_a_verified_baseline_measures_normally(self):
        self.two_versions_of_one_file()
        self.assertEqual(self.paths(), ["scripts/ci/thing.py"])

    def test_a_forged_baseline_would_hide_the_collision(self):
        # The defect, shown before it is refused: with the tracking ref moved
        # by hand onto a local branch, the colliding commits are "already in
        # main" and the count silently drops.
        self.two_versions_of_one_file()
        self.assertEqual(len(find_collisions(self.repo, verify=False)), 1)
        self.scratch.forge_baseline("HEAD")
        self.assertEqual(find_collisions(self.repo, verify=False), [])

    def test_a_forged_baseline_is_refused(self):
        self.two_versions_of_one_file()
        self.scratch.forge_baseline("HEAD")
        with self.assertRaises(BaselineUnverified) as ctx:
            find_collisions(self.repo)
        message = str(ctx.exception)
        self.assertIn("does not reflect the remote", message)
        self.assertIn(self.scratch.rev("HEAD"), message)
        self.assertIn("Refusing to report a collision count", message)

    def test_an_unreachable_remote_is_refused(self):
        # Offline is not agreement. Zero collisions measured against a baseline
        # nobody could confirm is not a fact about this repository.
        self.scratch.break_remote()
        self.assertEqual(verify_baseline(self.repo, "origin/main").state, STATE_UNREACHABLE)
        with self.assertRaises(BaselineUnverified) as ctx:
            find_collisions(self.repo)
        self.assertIn("could not be verified against the remote", str(ctx.exception))

    def test_the_cli_exits_non_zero_on_a_forged_baseline(self):
        self.two_versions_of_one_file()
        self.scratch.forge_baseline("HEAD")
        proc = self.cli()
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertNotIn("PASS", proc.stdout)

    def test_the_cli_exits_non_zero_when_offline(self):
        self.scratch.break_remote()
        proc = self.cli()
        self.assertEqual(proc.returncode, 1, proc.stdout + proc.stderr)
        self.assertNotIn("PASS", proc.stdout)
        payload = _json.loads(self.cli("--json").stdout)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["status"], "baseline-unverified")

    def test_an_unverified_baseline_is_a_distinct_exception(self):
        # `BaselineUnverified` exists so callers that tolerate "the branches
        # are not here" cannot accidentally tolerate "the baseline may be
        # forged". Both are CollisionError; only one may ever be swallowed.
        self.assertTrue(issubclass(BaselineUnverified, CollisionError))
        (self.repo / ".git" / "shallow").write_text("")
        with self.assertRaises(CollisionError) as ctx:
            find_collisions(self.repo)
        self.assertNotIsInstance(ctx.exception, BaselineUnverified)


class TestRealRepository(unittest.TestCase):
    def test_it_runs_or_refuses_against_this_repository(self):
        try:
            collisions = find_collisions(REPO_ROOT)
        except BaselineUnverified:
            # Never acceptable here: this repository has a remote and the
            # baseline is checkable. Re-raise rather than pass.
            raise
        except CollisionError as exc:
            # Only acceptable where the branches genuinely are not present.
            self.assertIn("Refusing to report zero", str(exc))
            return
        for collision in collisions:
            self.assertGreater(collision.versions, 1)
            self.assertEqual(len(set(collision.commits)), collision.versions)

    def test_the_baseline_is_verified_against_the_remote(self):
        # The gate for this control is pytest, so the verification has to be on
        # the path pytest takes.
        trust = verify_baseline(REPO_ROOT, "origin/main")
        self.assertTrue(
            trust.verified,
            f"this repository's baseline did not verify against its remote: {trust.state} {trust.detail}",
        )

    def test_this_repository_is_within_the_collision_budget(self):
        # `except CollisionError: return` used to sit here, which meant any
        # refusal — including a refusal caused by a doctored baseline — passed
        # this gate silently. An unverified baseline is now a failure, and a
        # genuinely unmeasurable checkout has to say which one it is.
        try:
            collisions = find_collisions(REPO_ROOT)
        except BaselineUnverified:
            raise
        except CollisionError as exc:
            self.assertIn("Refusing to report zero", str(exc))
            return
        self.assertLessEqual(
            len(collisions),
            MAX_COLLIDING_PATHS,
            "more paths have competing implementations than the budget allows:\n"
            + branch_collisions.format_report(REPO_ROOT, collisions),
        )


if __name__ == "__main__":
    unittest.main()
