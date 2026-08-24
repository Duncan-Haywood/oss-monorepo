"""Tests for the repository-branch-hygiene probe.

Two things matter here beyond ordinary correctness: (1) every scenario the
candidate write-up names by name lands in the category the write-up predicts,
and (2) nothing outside `duplicate` is ever recommended for deletion, and
nothing with unique commits is ever missing from the recovery manifest --
those are the candidate's stated liability boundary, not incidental
behaviour.
"""

from __future__ import annotations

import json
from pathlib import Path

from scanner import (
    DUPLICATE,
    MOVED_SINCE_CLOSED,
    PROTECTED,
    SAFE_TO_PROPOSE,
    SHARED,
    UNCERTAIN,
    UNIQUE_WORK,
    Branch,
    Commit,
    PullRequest,
    build_report,
    find_duplicate_tips,
    load_snapshot,
)

HERE = Path(__file__).resolve().parent
MIXED_REPO = HERE / "fixtures" / "mixed-repo.json"


def _report():
    return build_report(load_snapshot(MIXED_REPO))


def _category_of(report, name: str) -> str:
    for category, entries in report["review_queue"].items():
        for entry in entries:
            if entry["name"] == name:
                return category
    raise AssertionError(f"{name!r} not found in any category")


def test_protected_branch_is_never_a_candidate():
    report = _report()
    assert _category_of(report, "main") == PROTECTED
    protected_entry = next(e for e in report["review_queue"][PROTECTED] if e["name"] == "main")
    assert protected_entry["proposed_action"] == "keep"


def test_merged_and_clean_is_duplicate_and_proposable():
    report = _report()
    assert _category_of(report, "feature/merged-and-clean") == DUPLICATE
    entry = next(e for e in report["review_queue"][DUPLICATE] if e["name"] == "feature/merged-and-clean")
    assert entry["proposed_action"] == "review-for-deletion"


def test_open_and_reopened_pull_requests_are_shared():
    report = _report()
    assert _category_of(report, "feature/still-in-review") == SHARED
    assert _category_of(report, "feature/reopened-after-close") == SHARED


def test_tip_moved_after_close_is_flagged_even_though_pr_closed():
    report = _report()
    assert _category_of(report, "feature/grew-after-pr-closed") == MOVED_SINCE_CLOSED


def test_tip_moved_after_merge_is_flagged_even_though_pr_merged():
    """The candidate's own motivating evidence: a *merged* PR's branch can still

    carry unshipped work if it grew after the merge. An age- or merge-status-only
    heuristic would misread this branch as safely gone; this probe must not.
    """
    report = _report()
    assert _category_of(report, "feature/moved-after-merge") == MOVED_SINCE_CLOSED


def test_identical_tips_collapse_to_one_duplicate_and_one_kept_ref():
    report = _report()
    # chore/dup-a and chore/dup-b share a tip and neither has a PR. The
    # alphabetically-first name is kept (as unique_work, since it does carry
    # commits not on base); the other is marked duplicate_of the keeper.
    assert _category_of(report, "chore/dup-a") == UNIQUE_WORK
    assert _category_of(report, "chore/dup-b") == DUPLICATE
    dup_entry = next(e for e in report["review_queue"][DUPLICATE] if e["name"] == "chore/dup-b")
    assert dup_entry["duplicate_of"] == "chore/dup-a"


def test_open_pr_sharing_a_tip_is_not_reclassified_as_duplicate():
    """An open PR is bound to its branch name, so a later-sorting tip twin
    must stay `shared` / keep even when another ref is the alphabetical keeper.
    """
    snapshot = {
        "base_ref": "main",
        "base_tip_sha": "base",
        "branches": [
            Branch(
                name="aaa-twin",
                tip_sha="same",
                unique_commits=[Commit(sha="same", message="same work")],
            ),
            Branch(
                name="zzz-open-pr",
                tip_sha="same",
                unique_commits=[Commit(sha="same", message="same work")],
                pull_request=PullRequest(number=1, state="open", head_sha="same"),
            ),
        ],
    }
    report = build_report(snapshot)
    assert _category_of(report, "zzz-open-pr") == SHARED
    open_entry = next(e for e in report["review_queue"][SHARED] if e["name"] == "zzz-open-pr")
    assert open_entry["proposed_action"] == "keep"
    assert _category_of(report, "aaa-twin") == UNIQUE_WORK


def test_unique_work_with_no_pr_is_never_a_deletion_candidate():
    report = _report()
    assert _category_of(report, "experiment/never-opened-a-pr") == UNIQUE_WORK


def test_missing_ancestry_data_is_uncertain_not_duplicate():
    report = _report()
    assert _category_of(report, "legacy/unknown-history") == UNCERTAIN


def test_only_duplicate_is_ever_proposed_for_deletion():
    report = _report()
    assert SAFE_TO_PROPOSE == {DUPLICATE}
    for category, entries in report["review_queue"].items():
        for entry in entries:
            if category != DUPLICATE:
                assert entry["proposed_action"] == "keep", (category, entry["name"])
            else:
                assert entry["proposed_action"] == "review-for-deletion"


def test_recovery_manifest_covers_every_non_duplicate_branch_with_its_commits():
    report = _report()
    manifest_by_name = {entry["name"]: entry for entry in report["recovery_manifest"]}

    for category, entries in report["review_queue"].items():
        for entry in entries:
            if category == DUPLICATE:
                assert entry["name"] not in manifest_by_name
                continue
            assert entry["name"] in manifest_by_name, f"{entry['name']} missing from recovery manifest"

    # Every commit sha named on a branch in the fixture is recoverable from
    # the manifest somewhere -- nothing is silently dropped.
    snapshot = json.loads(MIXED_REPO.read_text(encoding="utf-8"))
    for branch in snapshot["branches"]:
        commits = branch.get("unique_commits")
        if not commits:
            continue
        manifest_entry = manifest_by_name.get(branch["name"])
        if manifest_entry is None:
            # Only a duplicate ref (redirected to its keeper) may be absent,
            # and only when its commits are identical to the keeper's.
            continue
        manifest_shas = {c["sha"] for c in (manifest_entry["unique_commits"] or [])}
        assert {c["sha"] for c in commits} <= manifest_shas


def test_find_duplicate_tips_ignores_protected_branches():
    branches = [
        Branch(name="main", tip_sha="samesha", protected=True),
        Branch(name="release/frozen", tip_sha="samesha", protected=True),
    ]
    assert find_duplicate_tips(branches) == {}


def test_find_duplicate_tips_needs_no_pr_or_ancestry_data():
    branches = [
        Branch(name="b", tip_sha="x", unique_commits=None),
        Branch(name="a", tip_sha="x", unique_commits=None),
        Branch(name="c", tip_sha="y", unique_commits=None),
    ]
    groups = find_duplicate_tips(branches)
    assert groups == {"x": ["b", "a"]}


def test_load_snapshot_rejects_missing_fields(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"base_ref": "main"}), encoding="utf-8")
    try:
        load_snapshot(bad)
    except ValueError as exc:
        assert "base_tip_sha" in str(exc)
    else:
        raise AssertionError("expected ValueError for a snapshot missing required fields")
