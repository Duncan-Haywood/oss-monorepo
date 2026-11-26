#!/usr/bin/env python3
"""Print the newest polish note's "Still weakest" list, with items later notes took.

Polish runs start from the last note's "Still weakest" list
(prompts/polish/prompt-0.md, "Pick one piece of work"). Several polish runs
land a note on the same day, so the filename date cannot order them, and
`ls -t` is meaningless in a fresh clone (four runs on 2026-11-26 picked the
alphabetically last note and missed the live list). This orders the notes by
the commit that added each one, newest first, and marks the items a later
note says it picked ("Picked item 2 of "Still weakest" in `polish-...md`").

    python3 prompts/polish_next.py          # newest note, its list, taken items
    python3 prompts/polish_next.py -n 3     # the three newest notes

Marking is best effort: it reads the citing sentence, so an item a run took
without citing it, or an open PR, is not seen. Search open PRs as well.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "docs" / "reports"
HEADING = re.compile(r"^#+\s*Still weakest.*$", re.M)
CITE = re.compile(
    r"[Ii]tems?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)\s+of\s+(?:the\s+)?\"Still weakest[^\"]*\""
    r"(?:\s+list)?[^`]{0,40}?\bin\s+`(?:docs/reports/)?(polish-[^`]+?\.md)`")


def shallow_boundary(root: Path = ROOT) -> set[str]:
    """Commits at a shallow clone's boundary: git diffs them against nothing, so
    `--diff-filter=A` says they add every file (platform/daily/collect.mjs)."""
    try:
        rel = subprocess.run(["git", "rev-parse", "--git-path", "shallow"], cwd=root,
                             capture_output=True, text=True, timeout=30).stdout.strip()
        path = Path(rel) if Path(rel).is_absolute() else root / rel
        return set(path.read_text().split()) if rel and path.is_file() else set()
    except (OSError, subprocess.TimeoutExpired):
        return set()


def commit_order(root: Path = ROOT) -> list[str]:
    """Polish note names, newest add first, from git history (empty if none).

    A note "added" by a shallow boundary commit is older than the clone's
    history, so it is left out and ordered by name (ordered_notes)."""
    names: list[str] = []
    boundary = shallow_boundary(root)
    for ref in ("origin/main", "HEAD"):
        try:
            out = subprocess.run(
                ["git", "log", ref, "--format=@%H", "--name-only", "--diff-filter=A",
                 "--", "docs/reports/polish-*.md"],
                cwd=root, capture_output=True, text=True, timeout=60).stdout
        except (OSError, subprocess.TimeoutExpired):
            continue
        skip = False
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("@"):
                skip = line[1:] in boundary
                continue
            name = Path(line).name
            if name and not skip and name not in names:
                names.append(name)
        if names:
            break
    return names


def ordered_notes(reports: Path = REPORTS, history: list[str] | None = None) -> list[Path]:
    """Notes newest first: committed ones by add commit, then the rest by name.

    A note on disk but not in history (this branch's own, uncommitted) is
    newest of all; notes older than a shallow clone's history follow by name.
    """
    files = {p.name: p for p in reports.glob("polish-*.md")}
    history = commit_order() if history is None else history
    known = [files[n] for n in history if n in files]
    rest = sorted((p for n, p in files.items() if n not in history), key=lambda p: p.name,
                  reverse=True)
    dated = known[0].name[:17] if known else ""
    fresh = [p for p in rest if p.name[:17] >= dated]
    return fresh + known + [p for p in rest if p not in fresh]


def still_weakest(text: str) -> str | None:
    m = HEADING.search(text)
    if not m:
        return None
    nxt = re.search(r"^#+\s", text[m.end():], re.M)
    end = m.end() + nxt.start() if nxt else len(text)
    return text[m.start():end].strip()


def taken(notes: list[Path]) -> dict[str, dict[int, str]]:
    """{cited note: {item number: citing note}} from every note's citing sentences."""
    out: dict[str, dict[int, str]] = {}
    for p in notes:
        flat = re.sub(r"\s+", " ", p.read_text(encoding="utf-8", errors="replace"))
        for nums, cited in CITE.findall(flat):
            if cited == p.name:
                continue
            for n in re.findall(r"\d+", nums):
                out.setdefault(cited, {}).setdefault(int(n), p.name)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("-n", type=int, default=1, help="how many of the newest notes to print")
    args = ap.parse_args(argv)
    notes = ordered_notes()
    if not notes:
        print("no polish notes in docs/reports/: survey instead (prompt-0.md)")
        return 3
    marks = taken(notes)
    for p in notes[:args.n]:
        print(f"== docs/reports/{p.name}")
        body = still_weakest(p.read_text(encoding="utf-8", errors="replace"))
        print(body or "(no \"Still weakest\" section)")
        for n, by in sorted(marks.get(p.name, {}).items()):
            print(f"   item {n}: taken by {by}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
