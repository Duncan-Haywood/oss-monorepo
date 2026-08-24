"""Classify repository branches into a review queue, never a delete queue.

Tests the `repository-branch-hygiene` candidate's narrowest claim: given a
read-only snapshot of a repository's branches, their tips, and their linked
pull requests, a scanner can separate branches that are safe to *propose* for
cleanup from branches carrying work that would be lost, without collapsing an
unclear case into either bucket.

Six categories, matching the candidate write-up's boundary
(`../candidates/repository-branch-hygiene.md`):

  protected      - branch protection is on; never proposed for cleanup.
  shared         - an open pull request still targets this branch.
  moved_since_closed - linked to a closed/merged PR, but the branch's tip is
                   not the sha that PR closed at. The candidate's own
                   "Existing signal" section is why this exists: an
                   age-since-close heuristic misreads a branch that grew new
                   commits after its PR closed as stale.
  duplicate      - every commit on the branch is already reachable from the
                   base branch (or an identical tip shared with a kept
                   branch). The only category ever proposed for deletion.
  unique_work    - commits exist that are not reachable from the base branch
                   and not explained by shared/moved_since_closed. Always
                   carries a recovery manifest; never proposed for deletion.
  uncertain      - the inputs needed to decide are missing or contradictory.
                   Never collapsed into a deletion recommendation -- that is
                   the candidate's explicit boundary, not a gap in this tool.

This module reads a repository snapshot (see `fixtures/*.json` for the
shape); it does not fetch, delete, or write to any repository.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROTECTED = "protected"
SHARED = "shared"
MOVED_SINCE_CLOSED = "moved_since_closed"
DUPLICATE = "duplicate"
UNIQUE_WORK = "unique_work"
UNCERTAIN = "uncertain"

# Only this category is ever proposed for deletion. Every other category is
# a review or keep signal -- the candidate's boundary is a queue, not a
# deletion, and collapsing that here would be the product failure the write-up
# names.
SAFE_TO_PROPOSE = {DUPLICATE}


@dataclass
class Commit:
    sha: str
    message: str


@dataclass
class PullRequest:
    number: int
    state: str  # "open", "merged", or "closed_unmerged"
    head_sha: str


@dataclass
class Branch:
    name: str
    tip_sha: str
    protected: bool = False
    # Commits reachable from `tip_sha` but not from the base branch -- what
    # `git rev-list <base>..<branch>` would report. `None` means unknown,
    # which forces `uncertain` rather than being read as "no unique work".
    unique_commits: list[Commit] | None = field(default_factory=list)
    pull_request: PullRequest | None = None


def _load_commit(payload: dict[str, Any]) -> Commit:
    return Commit(sha=payload["sha"], message=payload["message"])


def _load_pull_request(payload: dict[str, Any] | None) -> PullRequest | None:
    if payload is None:
        return None
    return PullRequest(number=payload["number"], state=payload["state"], head_sha=payload["head_sha"])


def load_snapshot(path: Path) -> dict[str, Any]:
    """Load a repository snapshot: base branch name/tip plus a branch list.

    A snapshot stands in for what a read-only GitHub App would collect via
    the refs and pull-requests APIs -- no git clone or network call happens
    here.
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    required = {"base_ref", "base_tip_sha", "branches"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"snapshot missing fields: {', '.join(sorted(missing))}")

    branches = []
    for entry in payload["branches"]:
        unique_raw = entry.get("unique_commits", [])
        unique = None if unique_raw is None else [_load_commit(c) for c in unique_raw]
        branches.append(
            Branch(
                name=entry["name"],
                tip_sha=entry["tip_sha"],
                protected=entry.get("protected", False),
                unique_commits=unique,
                pull_request=_load_pull_request(entry.get("pull_request")),
            )
        )
    return {"base_ref": payload["base_ref"], "base_tip_sha": payload["base_tip_sha"], "branches": branches}


def classify_branch(branch: Branch, base_tip_sha: str) -> str:
    """Return one of the six categories for a single branch.

    Order matters and is deliberate: protection and an open PR are read
    before ancestry, because a branch can be fully merged into base *and*
    still have an open PR restating the same diff (e.g. a re-opened PR) --
    that branch is still in active review, not a stale duplicate.
    """
    if branch.protected:
        return PROTECTED

    pr = branch.pull_request
    if pr is not None and pr.state == "open":
        return SHARED

    if branch.unique_commits is None:
        return UNCERTAIN

    if pr is not None and pr.state in ("merged", "closed_unmerged") and pr.head_sha != branch.tip_sha:
        return MOVED_SINCE_CLOSED

    if branch.tip_sha == base_tip_sha or not branch.unique_commits:
        return DUPLICATE

    return UNIQUE_WORK


def find_duplicate_tips(branches: list[Branch]) -> dict[str, list[str]]:
    """Group non-protected branch names by identical tip sha.

    Two refs pointing at the same commit are redundant regardless of
    ancestry, and this is cheap to answer even when nothing else about a
    branch is known -- it needs no base-branch comparison and no pull
    request data, only the tip shas themselves. Only groups with more than
    one member are returned; a lone tip is not a duplicate of anything.
    """
    by_tip: dict[str, list[str]] = {}
    for branch in branches:
        if branch.protected:
            continue
        by_tip.setdefault(branch.tip_sha, []).append(branch.name)
    return {sha: names for sha, names in by_tip.items() if len(names) > 1}


def build_report(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Classify every branch and assemble the review queue and recovery manifest.

    Every branch not classified `duplicate` carries its own recovery entry
    (tip, unique commit shas, linked PR) so that nothing is summarised away
    before a human decides -- the candidate's stated boundary is a review
    queue and a recovery manifest, never a silent delete list.
    """
    base_tip_sha = snapshot["base_tip_sha"]
    branches: list[Branch] = snapshot["branches"]
    duplicate_tips = find_duplicate_tips(branches)
    tip_to_group: dict[str, str] = {}
    for sha, names in duplicate_tips.items():
        # Keep the first name alphabetically as the ref a human would retain;
        # everyone else sharing that tip is redundant with it.
        keeper = min(names)
        for name in names:
            if name != keeper:
                tip_to_group[name] = keeper

    queue: dict[str, list[dict[str, Any]]] = {
        PROTECTED: [],
        SHARED: [],
        MOVED_SINCE_CLOSED: [],
        DUPLICATE: [],
        UNIQUE_WORK: [],
        UNCERTAIN: [],
    }
    recovery_manifest: list[dict[str, Any]] = []

    for branch in branches:
        category = classify_branch(branch, base_tip_sha)
        redundant_with = tip_to_group.get(branch.name)
        if redundant_with is not None and category not in (PROTECTED, SHARED):
            category = DUPLICATE

        entry: dict[str, Any] = {
            "name": branch.name,
            "tip_sha": branch.tip_sha,
            "category": category,
            "proposed_action": "review-for-deletion" if category in SAFE_TO_PROPOSE else "keep",
        }
        if redundant_with is not None:
            entry["duplicate_of"] = redundant_with
        if branch.pull_request is not None:
            entry["pull_request"] = {
                "number": branch.pull_request.number,
                "state": branch.pull_request.state,
                "head_sha": branch.pull_request.head_sha,
            }
        queue[category].append(entry)

        if category != DUPLICATE:
            recovery_manifest.append(
                {
                    "name": branch.name,
                    "tip_sha": branch.tip_sha,
                    "category": category,
                    "unique_commits": (
                        None
                        if branch.unique_commits is None
                        else [{"sha": c.sha, "message": c.message} for c in branch.unique_commits]
                    ),
                }
            )

    return {
        "base_ref": snapshot["base_ref"],
        "base_tip_sha": base_tip_sha,
        "counts": {category: len(entries) for category, entries in queue.items()},
        "review_queue": queue,
        "recovery_manifest": recovery_manifest,
        "limitations": [
            "Read-only: this report proposes review-for-deletion candidates and never deletes.",
            "Only `duplicate` is ever proposed for deletion; every other category is `keep`.",
            "A pull request branch that lives in a contributor's fork has no ref in this "
            "repository's own branch list and is out of scope for a single-repository sweep.",
            "This is not a certification that a `keep` branch's work is unrecoverable elsewhere, "
            "only that this snapshot could not prove it was.",
        ],
    }


def write_report(snapshot_path: Path, output_path: Path) -> None:
    report = build_report(load_snapshot(snapshot_path))
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    write_report(args.snapshot, args.output)
