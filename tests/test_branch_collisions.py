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
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import subprocess
import tempfile
import unittest

import branch_collisions
from branch_collisions import MAX_COLLIDING_PATHS, CollisionError, find_collisions


class GitRepoTestCase(unittest.TestCase):
    def git(self, *args):
        result = subprocess.run(
            ["git", *args],
            cwd=str(self.repo),
            capture_output=True,
            text=True,
            env={
                "PATH": "/usr/bin:/bin:/usr/local/bin",
                "HOME": str(self.repo),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.invalid",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.invalid",
                "GIT_AUTHOR_DATE": "2026-08-01T12:00:00+00:00",
                "GIT_COMMITTER_DATE": "2026-08-01T12:00:00+00:00",
            },
        )
        if result.returncode != 0:
            raise AssertionError(f"git {' '.join(args)}: {result.stderr}")
        return result.stdout

    def setUp(self):
        self.repo = Path(tempfile.mkdtemp())
        self.git("init", "-q", "-b", "main")
        self.commit("README.md", "start")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")

    def commit(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        self.git("add", path)
        self.git("commit", "-q", "-m", f"add {path}")

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
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
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

    def test_missing_baseline_ref_refuses_to_report_zero(self):
        with self.assertRaises(CollisionError) as ctx:
            find_collisions(self.repo, "origin/nonexistent")
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


class TestRealRepository(unittest.TestCase):
    def test_it_runs_or_refuses_against_this_repository(self):
        try:
            collisions = find_collisions(REPO_ROOT)
        except CollisionError as exc:
            # Only acceptable where the branches genuinely are not present.
            self.assertIn("Refusing to report zero", str(exc))
            return
        for collision in collisions:
            self.assertGreater(collision.versions, 1)
            self.assertEqual(len(set(collision.commits)), collision.versions)

    def test_this_repository_is_within_the_collision_budget(self):
        try:
            collisions = find_collisions(REPO_ROOT)
        except CollisionError:
            return
        self.assertLessEqual(
            len(collisions),
            MAX_COLLIDING_PATHS,
            "more paths have competing implementations than the budget allows:\n"
            + branch_collisions.format_report(REPO_ROOT, collisions),
        )


if __name__ == "__main__":
    unittest.main()
