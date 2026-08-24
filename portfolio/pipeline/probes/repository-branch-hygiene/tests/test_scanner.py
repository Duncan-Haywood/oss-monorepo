from __future__ import annotations

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
