"""Read-only branch classification over a local git repository.

Classifies every non-default ref into exactly one of the six categories the
candidate write-up names: `protected`, `shared`, `duplicate`, `moved`,
`unique`, `uncertain`. Never deletes anything and never recommends a
deletion directly -- it produces the classification and the commit-level
evidence a human (or a later, separately-gated tool) would need to decide.

Uses only `git` subprocess calls against a working tree already on disk;
does not fetch, push, or write to the repository under scan.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

PROTECTED = "protected"
SHARED = "shared"
DUPLICATE = "duplicate"
MOVED = "moved"
UNIQUE = "unique"
UNCERTAIN = "uncertain"


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


class GitError(RuntimeError):
    pass


@dataclass(frozen=True)
class RefInfo:
    name: str
    sha: str
    origin: str = "local"
    also_at: tuple[str, ...] = field(default_factory=tuple)
    diverged_copies: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Classification:
    ref: str
    sha: str
    origin: str
    category: str
    reason: str
    unique_commits: tuple[str, ...] = field(default_factory=tuple)
    shared_with: tuple[str, ...] = field(default_factory=tuple)
    duplicate_of: str | None = None
    recorded_tip: str | None = None
    also_at: tuple[str, ...] = field(default_factory=tuple)
    diverged_copies: tuple[str, ...] = field(default_factory=tuple)


def list_branch_refs(repo: Path) -> list[RefInfo]:
    """One entry per branch *name*, not per ref.

    A local branch and its remote-tracking copies are the same logical
    branch. Emitting them separately made every tracked branch in a real
    repository classify as `shared` with itself, which is noise that would
    bury the handful of refs a reviewer actually needs to look at. Copies
    that agree on the tip are recorded in `also_at`; copies that disagree
    are recorded in `diverged_copies`, which is a genuine finding.
    """
    collected: dict[str, list[tuple[str, str]]] = {}

    heads = _git(repo, "for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads")
    for line in heads.splitlines():
        if not line.strip():
            continue
        name, sha = line.split()
        collected.setdefault(name, []).append(("local", sha))

    remotes = _git(
        repo, "for-each-ref", "--format=%(refname:short) %(objectname)", "refs/remotes"
    )
    for line in remotes.splitlines():
        if not line.strip():
            continue
        name, sha = line.split()
        if name.endswith("/HEAD"):
            continue
        remote, _, branch = name.partition("/")
        if not branch:
            continue
        collected.setdefault(branch, []).append((remote, sha))

    refs: list[RefInfo] = []
    for name, copies in collected.items():
        # Prefer the local copy as the authoritative tip when one exists.
        primary_origin, primary_sha = next(
            (c for c in copies if c[0] == "local"),
            copies[0],
        )
        agreeing = tuple(
            sorted(o for o, s in copies if s == primary_sha and o != primary_origin)
        )
        diverged = tuple(sorted(f"{o}={s}" for o, s in copies if s != primary_sha))
        refs.append(
            RefInfo(
                name=name,
                sha=primary_sha,
                origin=primary_origin,
                also_at=agreeing,
                diverged_copies=diverged,
            )
        )
    return refs


def _live_shas(ref: RefInfo) -> list[str]:
    """Every tip SHA currently recorded for this name, including diverged copies.

    Name-grouping keeps only the preferred tip on `RefInfo.sha`. The disagreed
    tips are still live refs; graph checks have to see them or a different
    name sitting on `origin/X` looks unique while those commits survive.
    """
    shas = [ref.sha]
    for copy in ref.diverged_copies:
        sha = copy.rsplit("=", 1)[-1]
        if sha and sha not in shas:
            shas.append(sha)
    return shas


def _is_ancestor(repo: Path, maybe_ancestor: str, descendant: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", maybe_ancestor, descendant],
        capture_output=True,
        text=True,
    )
    if result.returncode in (0, 1):
        return result.returncode == 0
    raise GitError(f"merge-base --is-ancestor failed: {result.stderr.strip()}")


def _commits_unique_to(repo: Path, sha: str, exclude_shas: list[str]) -> list[str]:
    args = ["rev-list", sha]
    for exclude in exclude_shas:
        args.append(f"^{exclude}")
    out = _git(repo, *args)
    return [line for line in out.splitlines() if line]


def _object_exists(repo: Path, sha: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "-e", sha],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def classify_repo(
    repo: Path,
    protected: set[str],
    recorded_tips: dict[str, str] | None = None,
) -> list[Classification]:
    """Classify every branch ref except the protected set itself.

    `recorded_tips` maps a branch name to the tip SHA it had at some past
    snapshot (e.g. when its pull request was last observed closed). A live
    tip that differs from a recorded one, and is not otherwise explained by
    `duplicate`/`shared`, is classified `moved` -- new commits landed after
    the snapshot was taken.
    """
    recorded_tips = recorded_tips or {}
    refs = list_branch_refs(repo)
    by_name = {r.name: r for r in refs}
    protected_shas = {
        sha for name in protected if name in by_name for sha in _live_shas(by_name[name])
    }

    results: list[Classification] = []
    for ref in refs:
        if ref.name in protected:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=PROTECTED,
                    reason="name matches the protected-branch list",
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        others = [r for r in refs if r.name != ref.name]
        same_sha = [o.name for o in others if ref.sha in _live_shas(o)]
        if same_sha:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=SHARED,
                    reason="tip commit is identical to another branch under a different name",
                    shared_with=tuple(sorted(same_sha)),
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        recorded = recorded_tips.get(ref.name)
        if recorded is not None and not _object_exists(repo, recorded):
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=UNCERTAIN,
                    reason=(
                        "a recorded snapshot tip is referenced but no longer "
                        "resolvable in this repository -- history may have "
                        "been rewritten or garbage-collected"
                    ),
                    recorded_tip=recorded,
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        exclude = list(protected_shas) + [sha for o in others for sha in _live_shas(o)]

        # Protected branches are checked first on purpose: "already merged to
        # main" is the answer a reviewer can act on, while "also an ancestor of
        # some other topic branch" is true but tells them nothing about whether
        # the work survived.
        candidate_targets = [by_name[n] for n in sorted(protected) if n in by_name]
        candidate_targets += [o for o in others if o.name not in protected]

        duplicate_target = None
        try:
            for target in candidate_targets:
                if target.name == ref.name:
                    continue
                if any(
                    sha != ref.sha and _is_ancestor(repo, ref.sha, sha)
                    for sha in _live_shas(target)
                ):
                    duplicate_target = target.name
                    break
        except GitError:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=UNCERTAIN,
                    reason="ancestry check failed against another live ref",
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        if duplicate_target is not None:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=DUPLICATE,
                    reason=f"every commit on this ref is already an ancestor of '{duplicate_target}'",
                    duplicate_of=duplicate_target,
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        try:
            unique_commits = _commits_unique_to(repo, ref.sha, exclude)
        except GitError:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=UNCERTAIN,
                    reason="could not enumerate commits unique to this ref",
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        if recorded is not None and recorded != ref.sha:
            results.append(
                Classification(
                    ref=ref.name,
                    sha=ref.sha,
                    origin=ref.origin,
                    category=MOVED,
                    reason=(
                        f"live tip differs from the recorded snapshot tip "
                        f"{recorded[:12]} -- commits landed after the snapshot "
                        "was taken, so an age check against the snapshot date "
                        "would have been wrong"
                    ),
                    unique_commits=tuple(unique_commits),
                    recorded_tip=recorded,
                    also_at=ref.also_at,
                    diverged_copies=ref.diverged_copies,
                )
            )
            continue

        results.append(
            Classification(
                ref=ref.name,
                sha=ref.sha,
                origin=ref.origin,
                category=UNIQUE,
                reason="has commits not reachable from any protected branch or other live ref",
                unique_commits=tuple(unique_commits),
                recorded_tip=recorded,
                also_at=ref.also_at,
                diverged_copies=ref.diverged_copies,
            )
        )

    return results
