"""Branch lifetime (first commit to merge) for research pull requests, and the replay from that start.

Reuses the git helpers of swe-prlifetime (research_merges, base_at, conflicts, wilson, pctl, join).
Standard library only.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "swe-prlifetime" / "src"))
from swe_prlifetime.analyse import (SHARED, base_at, conflicts, join, pctl, read_prs,  # noqa: E402,F401
                                    research_merges, ts, wilson)


def read_branches(path):
    """{number: (first_commit_unix, n_commits, truncated)}"""
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            out[int(r["number"])] = (ts(r["first_commit"]), int(r["n_commits"]), bool(int(r["truncated"])))
    return out


def attach(kept, branches):
    """Add `first` (branch start, clamped so it is never after the PR's creation + its own commits cannot
    postdate the merge) to each kept PR with a branch row. Returns (rows, n_missing, n_skewed).
    `first` is the earlier of the first commit and the PR creation: a commit dated after creation is a
    clock or rebase artefact, and the PR cannot have started later than it was opened."""
    rows, missing, skewed = [], 0, 0
    for k in kept:
        b = branches.get(k["pr"])
        if b is None:
            missing += 1
            continue
        first = b[0]
        if first > k["created"]:
            skewed += 1
            first = k["created"]
        rows.append(dict(k, first=first, n_commits=b[1]))
    return rows, missing, skewed


def branch_minutes(rows):
    return [max(0, r["merged"] - r["first"]) / 60 for r in rows]


def landings_between(me, merges, start):
    """Other shared-file merges landing from `start` up to, but not including, me's own merge."""
    return sum(1 for o in merges
               if o["sha"] != me["sha"] and set(o["files"]) & set(SHARED) and start <= o["time"] < me["time"])


def research_landings_between(me, merges, start):
    """Same, for any other research/ merge (what a replay can collide with in a project directory)."""
    return sum(1 for o in merges if o["sha"] != me["sha"] and start <= o["time"] < me["time"])
