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

That scan is deliberately conservative, and on a repository where `main` moves
this fast it went silent: sibling branches keep landing the same feature under a
different filename with reworded comments, so the lines still read as absent. On
2026-08-27 the scan said NOT SUPERSEDED for 65 of the 66 open pull requests, none
of which could be merged either. A gate that never opens is a gate nobody uses.

So there is a second, independent question, decided by git rather than by string
matching:

    replay the branch on top of the base, resolving every conflicting hunk in
    the base's favour, and compare the resulting tree to the base's

Identical trees mean the branch contributes no content -- the same tree object,
not merely equivalent content -- and that holds however the base spells the
feature. A file the base lacks merges cleanly and changes the tree, so the
strategy hides nothing. Either proof is enough for exit 0; the report names
which one fired and what it does not cover.

Two deliberate biases in the line scan, both toward keeping work:

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
import difflib
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

# Lines that carry no evidence of a feature. A close is not made safe by the
# base branch also containing a `}` or a blank line, and counting those as
# "already present" is how a real addition gets averaged away into a
# reassuring percentage.
_TRIVIAL = re.compile(r"^[\s{}()\[\];,.:+*/<>|&#=~`'\"-]*$")

# Short fragments match incidentally almost anywhere in a tree of this size, so
# they are evidence of nothing in either direction.
_MIN_SIGNIFICANT_LENGTH = 12


# A line and its closest twin in the base tree, with the ratio that paired them.
# `base_path` is where the twin lives, which is the whole point: it is almost
# always a *different* file from the one the branch edited.
@dataclass
class NearMatch:
    line: str
    base_line: str
    base_path: str
    ratio: float


# Two lines this similar are the same line with identifiers renamed. Below it,
# ordinary same-language boilerplate starts pairing with itself -- every
# `const x = Number(...)` in a calculator resembles every other -- and the
# report turns into noise that hides the real twins.
_RENAME_RATIO = 0.75

# The share of one file's unmatched lines that must have a twin before it is
# called a rename rather than a few coincidental echoes.
#
# Measured per file, not across the branch. A rename lands in one module: the
# #1323 shape is a `calc.mjs` that is entirely the base's own `calc.mjs` with
# `largestCostComponent` written where the base says `largestCostDriver`, sat
# beside a genuinely new test file and a new usage note. Averaged over the
# branch that reads 44% and stays silent; the module that matters is at 63%.
_RENAME_SHARE = 0.6

# Below this, a single coincidence in a small file clears the share on its own.
_RENAME_MIN_TWINS = 3

# Append-only records are exempt from the rename report. They are not features
# and cannot be renamed into one: every reading in `usage.yaml` is the same six
# keys with a different number, so `local_comparisons: 0` pairs at 95% with
# `local_comparisons: 1`, and `reports_exported: 0` at 80% with an unrelated
# venture's `shortlist_exported: 0`. Both pairs are true and neither means the
# branch's work exists already -- which is the only question here.
_RECORD_FILES = re.compile(
    r"(^|/)(usage/usage\.yaml"
    r"|ledger/\d{4}-\d{2}\.yaml"
    r"|ledger/(verifications|asks)\.yaml"
    r"|progress-log\.ts)$"
)


@dataclass
class FileVerdict:
    path: str
    added: int
    unmatched: list[str] = field(default_factory=list)
    missing_from_base: bool = False
    near: list[NearMatch] = field(default_factory=list)

    @property
    def rename_suspected(self) -> bool:
        if _RECORD_FILES.search(self.path):
            return False
        if len(self.near) < _RENAME_MIN_TWINS:
            return False
        return len(self.near) / len(self.unmatched) >= _RENAME_SHARE


@dataclass
class Verdict:
    base: str
    head: str
    merge_base: str
    files: list[FileVerdict]
    identical_merge: bool = False

    @property
    def superseded(self) -> bool:
        return self.identical_merge or not any(f.unmatched for f in self.files)

    @property
    def unmatched_total(self) -> int:
        return sum(len(f.unmatched) for f in self.files)

    @property
    def near_total(self) -> int:
        return sum(len(f.near) for f in self.files)

    @property
    def renamed_files(self) -> list[FileVerdict]:
        return [f for f in self.files if f.rename_suspected]

    @property
    def rename_suspected(self) -> bool:
        """Whether some file's unmatched lines are the base's own code, renamed.

        Deliberately not folded into `superseded`. A twin at 93% similarity is
        strong evidence and still not proof: the one word that differs can be
        the fix the branch exists to make -- `> ` where the base has `>=` is a
        99% twin and an off-by-one either way. This flags the branch to be
        read, and leaves the exit code saying "do not close".
        """
        return not self.superseded and bool(self.renamed_files)


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


def neighbourhood(paths: list[str]) -> list[str]:
    """The directories a renamed twin would plausibly live in.

    A feature re-implemented under another filename lands beside the original:
    `site/csv.mjs` against `site/export.mjs`, `draft.mjs` against `share.mjs`.
    Searching the whole tree instead would pair a calculator's arithmetic with
    the same arithmetic in an unrelated venture, which is true and useless.

    Two levels is what `ventures/<slug>` and `platform/<area>` need; a path
    shallower than that contributes its own directory.
    """
    dirs: set[str] = set()
    for path in paths:
        parts = path.split("/")
        dirs.add("/".join(parts[:2]) if len(parts) > 2 else (
            parts[0] if len(parts) > 1 else ""
        ))
    return sorted(d for d in dirs if d)


def base_neighbourhood_lines(base: str, dirs: list[str]) -> dict[str, str]:
    """Every significant line in those directories on the base, to its file.

    One `git grep` over the base tree rather than a `git show` per file: a
    venture here runs to thirty-odd files and the whole point is that this
    stays cheap enough to run on every close.

    A line living in more than one file keeps the first seen. The report names
    a twin so a reader can go and look; which of two identical copies it names
    does not change what they will find.
    """
    if not dirs:
        return {}
    result = subprocess.run(
        ["git", "grep", "-I", "-n", "-e", "", base, "--", *dirs],
        capture_output=True,
        text=True,
        check=False,
    )
    lines: dict[str, str] = {}
    prefix = f"{base}:"
    for entry in result.stdout.splitlines():
        if not entry.startswith(prefix):
            continue
        rest = entry[len(prefix):]
        path, _, tail = rest.partition(":")
        _, _, content = tail.partition(":")
        stripped = content.strip()
        if stripped and significant(stripped) and stripped not in lines:
            lines[stripped] = path
    return lines


def nearest_in_base(
    unmatched: list[str], corpus: dict[str, str]
) -> list[NearMatch]:
    """Pair each unmatched line with its closest twin in the base, if any.

    `difflib` on every pair would be quadratic over tens of thousands of lines.
    `get_close_matches` does the same comparison but stops early on candidates
    whose length alone puts them out of reach, which is most of them.
    """
    if not corpus:
        return []
    keys = list(corpus)
    matches: list[NearMatch] = []
    for line in unmatched:
        stripped = line.strip()
        close = difflib.get_close_matches(stripped, keys, n=1, cutoff=_RENAME_RATIO)
        if not close:
            continue
        twin = close[0]
        matches.append(
            NearMatch(
                line=stripped,
                base_line=twin,
                base_path=corpus[twin],
                ratio=difflib.SequenceMatcher(None, stripped, twin).ratio(),
            )
        )
    return matches


def is_shallow() -> bool:
    """Whether this clone's history is truncated."""
    return _git("rev-parse", "--is-shallow-repository", check=False).strip() == "true"


def _find_merge_base(base: str, head: str, *, fetch: bool = True) -> str:
    """The commit `base` and `head` diverged from, deepening the clone if needed.

    A scheduled session's clone is shallow. Both histories are then cut off
    before they meet, `git merge-base` exits non-zero, and every branch in the
    repository reads as unrelated to `main` -- so this tool answers "cannot
    decide" for the entire queue and the caller falls back to the guess it
    exists to replace. That is not a hypothetical: on 2026-08-27 a session found
    all 66 open pull requests reporting no merge base, from a clone that was
    simply shallow.

    `--deepen` only helps when the divergence is recent. Two branches cut from
    `main` a few hundred commits back need the whole history, so an unshallow is
    the escalation -- once, and only when the clone really is truncated, since
    on a complete clone a missing merge base is the genuine answer.
    """
    merge_base = _git("merge-base", base, head, check=False).strip()
    if merge_base or not fetch or not is_shallow():
        if merge_base:
            return merge_base
        raise RuntimeError(
            f"{base} and {head} have no common ancestor"
            + ("" if is_shallow() else " -- they are unrelated histories, and "
               "supersession is not a question git can answer about them")
        )

    _git("fetch", "--quiet", "--deepen=200", "origin", check=False)
    merge_base = _git("merge-base", base, head, check=False).strip()
    if merge_base:
        return merge_base

    _git("fetch", "--quiet", "--unshallow", "origin", check=False)
    merge_base = _git("merge-base", base, head, check=False).strip()
    if merge_base:
        return merge_base
    raise RuntimeError(
        f"{base} and {head} have no common ancestor even after unshallowing "
        "this clone -- they are unrelated histories"
    )


def merges_to_base(base: str, head: str) -> bool:
    """Whether merging `head` into `base`, base winning, changes nothing at all.

    The textual scan above is deliberately conservative, and on this repository
    that makes it silent: `main` absorbs a branch's feature from a sibling
    branch, reworded and under a different filename, and every line still reads
    as absent. On 2026-08-27 that was the verdict for 65 of 66 open pull
    requests -- none closable, none mergeable, the queue growing.

    This is the second, independent question, and it is decided by git rather
    than by string matching: replay the branch on top of the base, resolving
    every conflicting hunk in the base's favour, and compare the resulting tree
    to the base's. Identical trees mean the branch contributes no content --
    not "equivalent content", the same tree object. A new file the base lacks
    merges cleanly and changes the tree, so nothing is hidden by the strategy.

    The one thing it folds into "superseded": an edit that conflicts with work
    the base has since done in the same place. Base wins, so the edit vanishes.
    That is the right reading here -- the branch edited a version of the code
    that no longer exists, and reapplying it is re-derivation against the new
    code rather than a merge -- but it is a judgement, so `render` says so.

    Runs in a throwaway worktree: the caller's checkout is never touched.
    """
    with tempfile.TemporaryDirectory() as scratch:
        worktree = str(Path(scratch) / "replay")
        if subprocess.run(
            ["git", "worktree", "add", "--detach", "--quiet", worktree, head],
            capture_output=True, text=True, check=False,
        ).returncode != 0:
            return False
        try:
            def wt(*args: str) -> subprocess.CompletedProcess:
                return subprocess.run(
                    ["git", *args], cwd=worktree,
                    capture_output=True, text=True, check=False,
                )

            if wt("merge", "-X", "theirs", "--no-edit", base).returncode != 0:
                # add/add and modify/delete conflicts survive `-X theirs`, so
                # finish the same policy by hand: take the base's side, and
                # drop what the base does not have.
                for path in wt("diff", "--diff-filter=U", "--name-only").stdout.split("\n"):
                    if not path:
                        continue
                    if wt("checkout", "--theirs", "--", path).returncode == 0:
                        wt("add", "--", path)
                    else:
                        wt("rm", "--quiet", "-f", "--", path)
                if wt("commit", "--no-edit", "--quiet").returncode != 0:
                    return False
            merged = wt("rev-parse", "HEAD^{tree}").stdout.strip()
        finally:
            subprocess.run(
                ["git", "worktree", "remove", "--force", worktree],
                capture_output=True, text=True, check=False,
            )
    base_tree = _git("rev-parse", f"{base}^{{tree}}", check=False).strip()
    return bool(merged) and merged == base_tree


def evaluate(head_ref: str, base_ref: str, *, fetch: bool = True) -> Verdict:
    head = resolve_head(head_ref, fetch=fetch)
    base = resolve_head(base_ref, fetch=False)

    merge_base = _find_merge_base(base, head, fetch=fetch)

    # --numstat reports "-\t-\tpath" for a binary file instead of line counts.
    # Binary paths (generated mirror .gz blobs, mainly) have no line-level
    # content to compare, and `git show` on one crashes _git()'s text=True
    # decode the moment its bytes are not valid UTF-8 -- so they are excluded
    # here rather than fed to the line-based analysis below.
    paths = [
        line.split("\t", 2)[2]
        for line in _git("diff", "--numstat", f"{merge_base}..{head}").splitlines()
        if line and not line.startswith("-\t-\t")
    ]

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

    # Only asked when the cheap scan says work would be dropped: the replay
    # costs a worktree and a merge, and it cannot change a verdict that is
    # already "superseded".
    identical = bool(any(f.unmatched for f in files)) and merges_to_base(base, head)

    # Nor is the rename search worth its `git grep` when the branch is already
    # accounted for, or when the merge replay just proved the same thing more
    # cheaply.
    if not identical and any(f.unmatched for f in files):
        corpus = base_neighbourhood_lines(base, neighbourhood(paths))
        for f in files:
            if f.unmatched:
                f.near = nearest_in_base(f.unmatched, corpus)

    return Verdict(
        base=base,
        head=head,
        merge_base=merge_base,
        files=files,
        identical_merge=identical,
    )


def render(verdict: Verdict, ref: str, base_ref: str, samples: int = 3) -> str:
    out: list[str] = []
    if verdict.identical_merge:
        out.append(
            f"SUPERSEDED (identical-merge proof) — replaying {ref} on top of "
            f"{base_ref},"
        )
        out.append(f"resolving every conflict in {base_ref}'s favour, produces "
                   f"{base_ref}'s tree exactly.")
        out.append("")
        out.append(
            f"The line scan below found {verdict.unmatched_total} line(s) it could "
            "not match, but"
        )
        out.append("the merge says they carry no content: git produces the same tree "
                   "object either")
        out.append("way. That covers the case the line scan cannot — a feature "
                   f"{base_ref} re-implemented")
        out.append("under a different filename or with different wording.")
        out.append("")
        out.append("One judgement is folded in: an edit that conflicts with work "
                   f"{base_ref} has since")
        out.append("done in the same place loses, and so reads as superseded. That is "
                   "the intended")
        out.append(f"reading — the branch edited code {base_ref} no longer has, so "
                   "reapplying it is")
        out.append("re-derivation, not a merge — but check the lines below if the "
                   "branch was")
        out.append("supposed to change behaviour rather than add a surface.")
        out.append("")
        out.append("Closing drops no content. Say what supersedes it in the close "
                   "comment anyway,")
        out.append("so the next session does not have to re-derive this.")
        out.append("")
        for f in [f for f in verdict.files if f.unmatched]:
            out.append(f"  {f.path} — {len(f.unmatched)}/{f.added} lines the scan "
                       "could not match")
        return "\n".join(out).rstrip()
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

    if verdict.rename_suspected:
        out.append(_render_rename(verdict, ref, base_ref, samples))
    return "\n".join(out).rstrip()


def _render_rename(verdict: Verdict, ref: str, base_ref: str, samples: int) -> str:
    """The renamed-twin report appended under a NOT SUPERSEDED verdict.

    Its own function because it says the opposite of the verdict above it and
    the two must not read as one paragraph: the scan says do not close, and
    this says the work may nonetheless already be shipped under other names.
    Both are true, and only reading the pairs settles it.
    """
    flagged = verdict.renamed_files
    twins = sum(len(f.near) for f in flagged)
    out = [
        f"RENAME SUSPECTED — in {len(flagged)} file(s), most unmatched lines "
        f"({twins} of",
        f"{sum(len(f.unmatched) for f in flagged)}) have a close twin already in "
        f"{base_ref}, under a different name.",
        "",
        "The scan above compares lines, so a feature "
        f"{base_ref} re-implemented with its",
        "functions, files, or ids renamed reads as missing when it is present. "
        "Each pair",
        "below is one line and the base line it most resembles.",
        "",
        "This does not license a close, and the exit code still says so. Read the "
        "pairs:",
        f"if they are the same feature, {ref} is spent and should be closed naming "
        "the",
        "twin's file — not this scan. If the branch changes what the twin does, "
        "that",
        "difference is the work, and it still has to merge.",
        "",
    ]
    for f in flagged:
        out.append(f"  {f.path} — {len(f.near)}/{len(f.unmatched)} with a twin")
        for match in sorted(f.near, key=lambda m: -m.ratio)[:samples]:
            out.append(f"      branch  {match.line[:88]}")
            out.append(f"      base    {match.base_line[:88]}")
            out.append(f"              ↳ {match.base_path}  ({match.ratio:.0%} alike)")
        if len(f.near) > samples:
            out.append(f"      ... and {len(f.near) - samples} more pair(s)")
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
