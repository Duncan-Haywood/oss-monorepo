from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fixture_repo import build  # noqa: E402
from scanner import classify_repo  # noqa: E402


@pytest.fixture(scope="module")
def fixture(tmp_path_factory):
    return build(tmp_path_factory.mktemp("branch-hygiene"))


@pytest.fixture(scope="module")
def classifications(fixture):
    results = classify_repo(fixture.repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)
    return {c.ref: c for c in results}


def test_covers_every_expected_ref(fixture, classifications):
    assert set(fixture.expected) == set(classifications)


@pytest.mark.parametrize(
    "ref",
    ["main", "develop", "merged-feature", "closed-unmerged", "reopened-branch",
     "shared-primary", "shared-alias", "uncertain-ghost", "feature-y"],
)
def test_classification_matches_oracle(fixture, classifications, ref):
    assert classifications[ref].category == fixture.expected[ref]


def test_protected_never_reclassified_despite_unique_commits(classifications):
    develop = classifications["develop"]
    assert develop.category == "protected"


def test_duplicate_names_the_ref_it_duplicates(classifications):
    merged = classifications["merged-feature"]
    assert merged.duplicate_of == "main"


def test_shared_refs_name_each_other(classifications):
    primary = classifications["shared-primary"]
    alias = classifications["shared-alias"]
    assert "shared-alias" in primary.shared_with
    assert "shared-primary" in alias.shared_with


def test_moved_reports_the_recorded_snapshot_tip(fixture, classifications):
    reopened = classifications["reopened-branch"]
    assert reopened.recorded_tip == fixture.recorded_tips["reopened-branch"]
    assert reopened.recorded_tip != reopened.sha


def test_moved_still_lists_its_unique_commits(classifications):
    reopened = classifications["reopened-branch"]
    assert len(reopened.unique_commits) == 2


def test_unique_lists_exactly_its_own_commits(classifications):
    closed = classifications["closed-unmerged"]
    assert len(closed.unique_commits) == 1
    assert closed.unique_commits[0] == closed.sha


def test_fork_ref_origin_is_recorded(classifications):
    feature_y = classifications["feature-y"]
    assert feature_y.origin == "fork"
    assert feature_y.category == "unique"


def test_uncertain_ghost_flagged_not_guessed(classifications):
    ghost = classifications["uncertain-ghost"]
    assert ghost.category == "uncertain"
    assert ghost.recorded_tip == "0" * 40


def test_a_branch_and_its_tracking_remote_are_one_ref(tmp_path):
    """Regression: the first real-repository run classified every tracked
    branch as `shared` with itself, because `X` and `origin/X` were counted
    as two refs at the same tip. On a repository with hundreds of tracked
    branches that buries every genuine finding under false positives.
    """
    import subprocess

    fixture = build(tmp_path)
    repo = fixture.repo
    subprocess.run(
        ["git", "-C", str(repo), "update-ref", "refs/remotes/origin/closed-unmerged",
         classify_lookup(repo, fixture, "closed-unmerged")],
        check=True, capture_output=True,
    )

    results = {c.ref: c for c in classify_repo(repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)}
    tracked = results["closed-unmerged"]
    assert tracked.category != "shared", "a branch must not be `shared` with its own remote copy"
    assert "origin" in tracked.also_at
    assert len([r for r in results if r == "closed-unmerged"]) == 1


def classify_lookup(repo, fixture, ref_name: str) -> str:
    from scanner import list_branch_refs

    return next(r.sha for r in list_branch_refs(repo) if r.name == ref_name)


def test_diverged_remote_copy_is_reported_not_hidden(tmp_path):
    """A local branch and a remote copy at *different* tips is a real
    finding (unpushed or force-pushed work) and must survive deduplication.
    """
    import subprocess

    fixture = build(tmp_path)
    repo = fixture.repo
    stale = classify_lookup(repo, fixture, "merged-feature")
    subprocess.run(
        ["git", "-C", str(repo), "update-ref", "refs/remotes/origin/closed-unmerged", stale],
        check=True, capture_output=True,
    )

    results = {c.ref: c for c in classify_repo(repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)}
    tracked = results["closed-unmerged"]
    assert tracked.diverged_copies, "a remote copy at a different tip must be reported"
    assert tracked.diverged_copies[0].startswith("origin=")


def _init_repo(path: Path) -> None:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "GIT_AUTHOR_NAME": "fixture",
        "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
        "GIT_COMMITTER_NAME": "fixture",
        "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
    }
    subprocess.run(["git", "init", "-q", "-b", "main", str(path)], check=True, capture_output=True, env=env)
    subprocess.run(
        ["git", "-C", str(path), "config", "commit.gpgsign", "false"],
        check=True, capture_output=True, env=env,
    )


def _commit_at(repo: Path, message: str, filename: str, content: str, date: str) -> str:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "GIT_AUTHOR_NAME": "fixture",
        "GIT_AUTHOR_EMAIL": "fixture@example.invalid",
        "GIT_COMMITTER_NAME": "fixture",
        "GIT_COMMITTER_EMAIL": "fixture@example.invalid",
        "GIT_AUTHOR_DATE": date,
        "GIT_COMMITTER_DATE": date,
    }
    (repo / filename).write_text(content, encoding="utf-8")
    subprocess.run(["git", "-C", str(repo), "add", filename], check=True, capture_output=True, env=env)
    subprocess.run(["git", "-C", str(repo), "commit", "-m", message], check=True, capture_output=True, env=env)
    tip = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True, env=env,
    )
    return tip.stdout.strip()


def _git(repo: Path, *args: str) -> str:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True, capture_output=True, text=True, env=env,
    )
    return result.stdout.strip()


def test_branch_at_another_name_diverged_tip_is_shared(tmp_path):
    """A tip that matches only `origin/X` (not local `X`) is still shared.

    After fetch, local `topic` is often stale while `origin/topic` has moved.
    Another name sitting on that remote-only tip used to classify `unique`
    because safety checks compared preferred tips only.
    """
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_repo(repo)
    _commit_at(repo, "c1", "a.txt", "1\n", "2024-01-01T00:00:00")
    _git(repo, "checkout", "-b", "topic")
    topic_local = _commit_at(repo, "topic local", "a.txt", "local\n", "2024-01-02T00:00:00")
    _git(repo, "checkout", "-b", "tmp-remote", "main")
    topic_remote = _commit_at(repo, "topic remote", "a.txt", "remote\n", "2024-01-03T00:00:00")
    subprocess.run(
        ["git", "-C", str(repo), "update-ref", "refs/remotes/origin/topic", topic_remote],
        check=True, capture_output=True,
    )
    _git(repo, "checkout", "main")
    _git(repo, "branch", "-D", "tmp-remote")
    _git(repo, "branch", "alias", topic_remote)

    results = {c.ref: c for c in classify_repo(repo, protected={"main"})}
    alias = results["alias"]
    assert alias.category == "shared", (
        "a branch whose tip equals another name's diverged remote copy "
        "must be shared, not unique"
    )
    assert "topic" in alias.shared_with
    topic = results["topic"]
    assert topic.sha == topic_local
    assert topic.diverged_copies


def test_unique_commits_exclude_diverged_tips(tmp_path):
    """Commits reachable from `origin/X` must not be listed as exclusive.

    `ahead` sits one commit past a stale local `topic`'s remote-only tip.
    Only that extra commit is exclusive; the remote tip is still live.
    """
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_repo(repo)
    _commit_at(repo, "c1", "a.txt", "1\n", "2024-01-01T00:00:00")
    _git(repo, "checkout", "-b", "topic")
    _commit_at(repo, "topic local", "a.txt", "local\n", "2024-01-02T00:00:00")
    _git(repo, "checkout", "-b", "tmp-remote", "main")
    topic_remote = _commit_at(repo, "topic remote", "a.txt", "remote\n", "2024-01-03T00:00:00")
    subprocess.run(
        ["git", "-C", str(repo), "update-ref", "refs/remotes/origin/topic", topic_remote],
        check=True, capture_output=True,
    )
    _git(repo, "checkout", "-b", "ahead")
    extra = _commit_at(repo, "ahead of remote topic", "extra.txt", "x\n", "2024-01-04T00:00:00")
    _git(repo, "branch", "-D", "tmp-remote")
    _git(repo, "checkout", "main")

    results = {c.ref: c for c in classify_repo(repo, protected={"main"})}
    ahead = results["ahead"]
    assert ahead.category == "unique"
    assert extra in ahead.unique_commits
    assert topic_remote not in ahead.unique_commits, (
        "origin/topic still reaches this commit; listing it as unique "
        "over-claims exclusivity"
    )


def test_ancestor_of_diverged_tip_is_duplicate(tmp_path):
    """Ancestry must see disagreed remote tips, not only the preferred local tip."""
    repo = tmp_path / "repo"
    repo.mkdir()
    _init_repo(repo)
    _commit_at(repo, "c1", "a.txt", "1\n", "2024-01-01T00:00:00")
    _git(repo, "checkout", "-b", "topic")
    _commit_at(repo, "topic local", "a.txt", "local\n", "2024-01-02T00:00:00")
    _git(repo, "checkout", "-b", "leftover", "main")
    mid = _commit_at(repo, "only on the remote line", "mid.txt", "mid\n", "2024-01-03T00:00:00")
    topic_remote = _commit_at(repo, "topic remote", "remote.txt", "remote\n", "2024-01-04T00:00:00")
    subprocess.run(
        ["git", "-C", str(repo), "update-ref", "refs/remotes/origin/topic", topic_remote],
        check=True, capture_output=True,
    )
    _git(repo, "checkout", "main")
    _git(repo, "branch", "-f", "leftover", mid)

    results = {c.ref: c for c in classify_repo(repo, protected={"main"})}
    leftover = results["leftover"]
    assert leftover.category == "duplicate"
    assert leftover.duplicate_of == "topic"
