"""Exercises the first experiment's kill criterion directly: "verify that
every unique commit remains recoverable." Two things must both be true for
the manifest to be trustworthy:

1. Every commit a `unique`/`moved` ref lists is *actually* only reachable
   through that ref -- deleting it would lose exactly those commits and no
   others silently escape the list.
2. A ref classified `duplicate` or `shared` truly contributes nothing --
   deleting it loses zero commits, so the manifest's "review, not delete"
   language is not covering for a category that is secretly unsafe.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fixture_repo import build  # noqa: E402
from scanner import DUPLICATE, MOVED, SHARED, UNIQUE, classify_repo  # noqa: E402


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def _reachable_shas(repo: Path, exclude_ref: str) -> set[str]:
    all_refs = [
        line.split()[0]
        for line in _git(repo, "for-each-ref", "--format=%(objectname) %(refname:short)").splitlines()
    ]
    remaining = _git(
        repo,
        "for-each-ref",
        "--format=%(refname)",
    ).splitlines()
    remaining = [r for r in remaining if not r.endswith(f"/{exclude_ref}") and not r.endswith(f"heads/{exclude_ref}")]
    if not remaining:
        return set()
    out = _git(repo, "rev-list", *remaining)
    return set(out.splitlines())


@pytest.fixture()
def fixture(tmp_path):
    return build(tmp_path)


def test_unique_and_moved_commits_are_actually_exclusive_to_their_ref(fixture):
    classifications = classify_repo(fixture.repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)
    checked_any = False
    for c in classifications:
        if c.category not in (UNIQUE, MOVED):
            continue
        checked_any = True
        assert c.unique_commits, f"{c.ref} classified {c.category} but lists no unique commits"
        still_elsewhere = _reachable_shas(fixture.repo, c.ref)
        for sha in c.unique_commits:
            assert sha not in still_elsewhere, (
                f"{c.ref} lists {sha} as unique-to-this-ref, but it is reachable "
                "from another ref too -- the manifest would over-claim exclusivity"
            )
    assert checked_any, "fixture produced no unique/moved refs to test against"


def _delete_ref(repo: Path, ref: str, origin: str) -> None:
    if origin == "local":
        _git(repo, "branch", "-D", ref)
    else:
        _git(repo, "update-ref", "-d", f"refs/remotes/{origin}/{ref}")


def _restore_ref(repo: Path, ref: str, origin: str, sha: str) -> None:
    target = f"refs/heads/{ref}" if origin == "local" else f"refs/remotes/{origin}/{ref}"
    _git(repo, "update-ref", target, sha)


def test_each_duplicate_or_shared_ref_alone_loses_nothing(fixture):
    """Each such ref is removed from a *restored* repository, one at a time.

    This is the claim the manifest actually makes -- "the commits on this ref
    are reachable from another ref today" -- and it is a per-ref claim.
    """
    classifications = classify_repo(fixture.repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)
    checked_any = False
    for c in classifications:
        if c.category not in (DUPLICATE, SHARED):
            continue
        checked_any = True
        before = set(_git(fixture.repo, "rev-list", "--all").splitlines())
        _delete_ref(fixture.repo, c.ref, c.origin)
        after = set(_git(fixture.repo, "rev-list", "--all").splitlines())
        _restore_ref(fixture.repo, c.ref, c.origin, c.sha)
        lost = before - after
        assert not lost, f"deleting {c.ref} ({c.category}) alone lost commits: {lost}"
    assert checked_any, "fixture produced no duplicate/shared refs to test against"


def test_acting_on_a_whole_shared_group_does_lose_work(fixture):
    """The manifest's stated race, pinned as a test rather than a warning.

    Two refs pointing at the same tip are each individually safe to delete
    and are *not* jointly safe. A tool that emitted per-ref verdicts and let
    an operator approve them as a batch would destroy exactly this commit.
    This asserts the failure is real, which is why `record.py` classifies
    `shared` as "review", never as "safe to delete".
    """
    classifications = classify_repo(fixture.repo, protected=fixture.protected, recorded_tips=fixture.recorded_tips)
    group = [c for c in classifications if c.category == SHARED]
    assert len(group) >= 2, "fixture needs a shared group to demonstrate the race"

    before = set(_git(fixture.repo, "rev-list", "--all").splitlines())
    for c in group:
        _delete_ref(fixture.repo, c.ref, c.origin)
    after = set(_git(fixture.repo, "rev-list", "--all").splitlines())
    for c in group:
        _restore_ref(fixture.repo, c.ref, c.origin, c.sha)

    assert before - after, (
        "deleting an entire shared group lost nothing, so this fixture no "
        "longer demonstrates the race the manifest warns about"
    )
