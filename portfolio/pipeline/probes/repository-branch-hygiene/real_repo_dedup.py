"""Run duplicate-tip detection against a real snapshot of this repository.

`scanner.find_duplicate_tips` needs only branch names and tip shas -- no pull
request linkage, no ancestry computation -- so it is the one classification
this repository's own branch list can demonstrate today, from
`fixtures/this-repo-heads-2026-08-24.json` (a `git ls-remote --heads origin`
capture, real data, no synthetic scenario). It does not compute the other
five categories: those need PR state and base-branch ancestry that this
demonstration did not collect. See the probe's README for what this run
found and what it deliberately does not claim.

Usage: python3 portfolio/pipeline/probes/repository-branch-hygiene/real_repo_dedup.py
"""

from __future__ import annotations

import json
from pathlib import Path

from scanner import Branch, find_duplicate_tips

HERE = Path(__file__).resolve().parent
SNAPSHOT = HERE / "fixtures" / "this-repo-heads-2026-08-24.json"


def main() -> None:
    payload = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    branches = [Branch(name=b["name"], tip_sha=b["tip_sha"], unique_commits=None) for b in payload["branches"]]

    groups = find_duplicate_tips(branches)
    total_redundant = sum(len(names) - 1 for names in groups.values())

    print(f"snapshot: {SNAPSHOT.name} ({payload['captured_at']}, {payload['source']})")
    print(f"branches scanned: {len(branches)}")
    print(f"duplicate-tip groups: {len(groups)}")
    print(f"redundant refs (group size - 1, summed): {total_redundant}")
    print()
    for sha, names in sorted(groups.items(), key=lambda item: -len(item[1])):
        keeper = min(names)
        print(f"  {sha[:12]}  keep {keeper!r}, duplicate: {[n for n in sorted(names) if n != keeper]}")


if __name__ == "__main__":
    main()
