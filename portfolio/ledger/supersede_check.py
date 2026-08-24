#!/usr/bin/env python3
"""Decide, from git alone, whether closing a pull request as superseded would
drop work that exists nowhere else.

`CLAUDE.md` already carries a rule about closing duplicates, written after the
2026-08-24 `#948`/`#953` incident: two sessions each closed their pull request
pointing at the other's as the survivor, and two complete implementations of the
same calculator shipped nothing. The rule it grew -- verify the survivor is
still open, before and after -- addresses that shape exactly, and does not
address the one that followed.

Twice in the hour of 2026-08-24T17:00Z a session closed a finished, tested
feature with a comment saying the work was already represented on `main`:

    #1006  "Closed as superseded by the merged eBay calculator follow-up
            work; this branch is conflicted and duplicates the active
            seller-tool direction."
    #1016  "Closed as superseded by the merged no-show scenario work already
            represented on main; no additional merge required."

Neither claim was true. `main` had no `share.mjs` and no `compareFeeScenarios`;
the features existed only on the branches being closed. Both were reopened or
recovered by later sessions, at the cost of two runs that shipped nothing else.

The failure is not carelessness. A session looking at a conflicted branch and a
`main` that has moved eight commits since sees genuine overlap -- the same
venture, the same file, adjacent features -- and "this is already handled" is a
reasonable-feeling inference. What it cannot do cheaply is check. So it doesn't,
and the close is irreversible in the way that matters: the work stays written,
but no one reads it again.

Checking is cheap. A pull request is superseded only if everything it adds is
already reachable from the base branch. That is decidable without running the
product, reviewing the diff, or trusting anyone's summary:

    added lines on the branch, minus lines already present on the base

If the remainder is empty, the close is safe. If it is not, the remainder is
precisely the work the close would drop, and the tool prints it.

Two deliberate biases, both toward keeping work:

*Textual, not semantic.* A feature reimplemented on `main` with different
wording reads as not-superseded here. That is a false positive, and the right
direction for one: its cost is a maintainer reading a diff, against a false
negative's cost of silently destroying a shipped feature.

*Whole tree, not same path.* An added line is searched for across the entire
base tree, not just its own path, so work that landed under a different filename
is still recognised as present.

What this does not do: it does not decide whether a pull request is *good*, or
whether two open branches overlap enough that one should yield. It answers one
question -- would closing this drop something that exists nowhere else -- which
is the question both of the closes above got wrong.

Usage:
    python3 portfolio/ledger/supersede_check.py 1006
    python3 portfolio/ledger/supersede_check.py some-branch --base origin/main
    python3 portfolio/ledger/supersede_check.py 1006 --no-fetch

Exit status is 0 when the branch adds nothing the base lacks (safe to close as
superseded) and 1 when it would drop work, so it can gate an automated close.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field

# Lines that carry no evidence of a feature. A close is not made safe by the
# base branch also containing a `}` or a blank line, and counting those as
# "already present" is how a real addition gets averaged away into a
# reassuring percentage.
_TRIVIAL = re.compile(r"^[\s{}()\[\];,.:+*/<>|&#=~`'\"-]*$")

# Short fragments match incidentally almost anywhere in a tree of this size, so
# they are evidence of nothing in either direction.
_MIN_SIGNIFICANT_LENGTH = 12


@dataclass
class FileVerdict:
    path: str
    added: int
    unmatched: list[str] = field(default_factory=list)
    missing_from_base: bool = False


@dataclass
class Verdict:
    base: str
    head: str
    merge_base: str
    files: list[FileVerdict]

    @property
    def superseded(self) -> bool:
        return not any(f.unmatched for f in self.files)

    @property
    def unmatched_total(self) -> int:
        return sum(len(f.unmatched) for f in self.files)


def _git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def significant(line: str) -> bool:
    """Whether an added line is evidence that a feature exists."""
    stripped = line.strip()
    if _TRIVIAL.match(stripped):
        return False
    return len(stripped) >= _MIN_SIGNIFICANT_LENGTH


def resolve_head(ref: str, *, fetch: bool = True) -> str:
    """Accept a pull request number, a branch name, or any commit-ish.

    A scheduled session's clone holds `main` and its own branch, so a pull
    request it did not open is not present locally. Fetching `refs/pull/N/head`
    on demand is the difference between this tool answering and this tool
    reporting that it cannot see the commit -- which is its own defeat
    condition, since the caller then falls back to guessing.
    """
    if ref.isdigit() and fetch:
        _git("fetch", "--quiet", "origin", f"refs/pull/{ref}/head", check=False)
        out = _git("rev-parse", "--verify", "--quiet", "FETCH_HEAD", check=False)
        if out.strip():
            return out.strip()
        raise RuntimeError(
            f"could not fetch refs/pull/{ref}/head -- is #{ref} a pull request "
            "in this repository?"
        )
    out = _git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}", check=False)
    if not out.strip():
        raise RuntimeError(f"{ref!r} does not resolve to a commit in this clone")
    return out.strip()


def added_lines(merge_base: str, head: str, path: str) -> list[str]:
    diff = _git(
        "diff", "--no-color", "--unified=0", f"{merge_base}..{head}", "--", path
    )
    return [
        line[1:]
        for line in diff.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    ]


def base_tree_lines(base: str, paths: list[str]) -> set[str]:
    """Every stripped line reachable from the base commit, for the paths given.

    Read as one batch: `git show` per path costs a process each, and a branch
    touching thirty files is ordinary here.
    """
    lines: set[str] = set()
    for path in paths:
        content = _git("show", f"{base}:{path}", check=False)
        for line in content.splitlines():
            stripped = line.strip()
            if stripped:
                lines.add(stripped)
    return lines


def base_contains(base: str, needles: list[str]) -> set[str]:
    """Which of `needles` appear anywhere in the base tree.

    The per-path check above misses work that landed under a different name, so
    anything it does not account for gets a whole-tree search before being
    called missing. `git grep -F` treats each pattern as a fixed string, which
    matters: added lines are code, full of regex metacharacters.
    """
    found: set[str] = set()
    for needle in needles:
        # The exit status is the whole answer, so this goes direct to
        # subprocess rather than through _git, which reads stdout instead.
        result = subprocess.run(
            ["git", "grep", "--fixed-strings", "--quiet", needle, base],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            found.add(needle)
    return found


def evaluate(head_ref: str, base_ref: str, *, fetch: bool = True) -> Verdict:
    head = resolve_head(head_ref, fetch=fetch)
    base = resolve_head(base_ref, fetch=False)

    merge_base = _git("merge-base", base, head, check=False).strip()
    if not merge_base:
        _git("fetch", "--quiet", "--deepen=200", "origin", check=False)
        merge_base = _git("merge-base", base, head).strip()

    paths = [p for p in _git(
        "diff", "--name-only", f"{merge_base}..{head}"
    ).splitlines() if p]

    base_lines = base_tree_lines(base, paths)
    existing_paths = {
        p for p in paths
        if subprocess.run(
            ["git", "cat-file", "-e", f"{base}:{p}"],
            capture_output=True, check=False
        ).returncode == 0
    }

    files: list[FileVerdict] = []
    for path in paths:
        candidates = [l for l in added_lines(merge_base, head, path) if significant(l)]
        if not candidates:
            continue
        unaccounted = [l for l in candidates if l.strip() not in base_lines]
        if unaccounted:
            elsewhere = base_contains(base, [l.strip() for l in unaccounted])
            unaccounted = [l for l in unaccounted if l.strip() not in elsewhere]
        files.append(
            FileVerdict(
                path=path,
                added=len(candidates),
                unmatched=unaccounted,
                missing_from_base=path not in existing_paths,
            )
        )

    return Verdict(base=base, head=head, merge_base=merge_base, files=files)


def render(verdict: Verdict, ref: str, base_ref: str, samples: int = 3) -> str:
    out: list[str] = []
    if verdict.superseded:
        out.append(f"SUPERSEDED — {ref} adds nothing {base_ref} does not already have.")
        out.append("")
        out.append("Closing it drops no work. Say what supersedes it in the close")
        out.append("comment anyway, so the next session does not have to re-derive this.")
        return "\n".join(out)

    carrying = [f for f in verdict.files if f.unmatched]
    out.append(
        f"NOT SUPERSEDED — {ref} carries {verdict.unmatched_total} line(s) "
        f"that are nowhere in {base_ref}."
    )
    out.append("")
    out.append("Closing it would drop them. If a survivor genuinely covers this work,")
    out.append("it is not this base branch — name the branch and check that instead.")
    out.append("")
    for f in carrying:
        marker = "  (file does not exist on base at all)" if f.missing_from_base else ""
        out.append(f"  {f.path} — {len(f.unmatched)}/{f.added} added lines absent{marker}")
        for line in f.unmatched[:samples]:
            out.append(f"      {line.strip()[:100]}")
        if len(f.unmatched) > samples:
            out.append(f"      ... and {len(f.unmatched) - samples} more")
        out.append("")
    return "\n".join(out).rstrip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check whether closing a pull request as superseded would "
                    "drop work that exists nowhere else."
    )
    parser.add_argument("ref", help="pull request number, branch name, or commit-ish")
    parser.add_argument(
        "--base", default="origin/main",
        help="branch the work is claimed to be superseded by (default: origin/main)",
    )
    parser.add_argument(
        "--no-fetch", action="store_true",
        help="do not fetch; use only what this clone already has",
    )
    args = parser.parse_args(argv)

    try:
        verdict = evaluate(args.ref, args.base, fetch=not args.no_fetch)
    except RuntimeError as error:
        print(f"supersede_check: {error}", file=sys.stderr)
        return 2

    print(render(verdict, args.ref, args.base))
    return 0 if verdict.superseded else 1


if __name__ == "__main__":
    raise SystemExit(main())
