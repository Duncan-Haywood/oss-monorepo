#!/usr/bin/env python3
"""List and pick up ideas people dictated into ideas/INBOX.md.

People without an agent session add a paragraph under "## New" in
ideas/INBOX.md from github.com. A commit there needs write access, so an
entry is a direct request (.github/prompts/human-requests.md). Ideas from
anyone else arrive as issues from the "idea" form; this script prints the
search for those, because they are data, not requests.

  python3 prompts/ideas.py                 # pending ideas, oldest first
  python3 prompts/ideas.py --json
  python3 prompts/ideas.py take 1 --pr <url>   # move idea 1 to "Picked up"
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

INBOX = Path(__file__).resolve().parent.parent / "ideas" / "INBOX.md"
NEW, PICKED = "## New", "## Picked up"
ISSUE_SEARCH = 'repo:duncan-haywood/oss-monorepo is:issue is:open in:title "[idea]"'


def _split(text: str) -> tuple[str, str, str]:
    """Return (head through "## New", the New body, "## Picked up" onward)."""
    start = text.index(NEW) + len(NEW)
    end = text.index(PICKED, start)
    return text[:start], text[start:end], text[end:]


def pending(text: str) -> list[str]:
    """Ideas under "## New": paragraphs, with HTML comments and list markers removed."""
    body = re.sub(r"<!--.*?-->", "", _split(text)[1], flags=re.S)
    ideas = []
    for para in re.split(r"\n\s*\n", body):
        lines = [re.sub(r"^\s*(?:[-*+]|\d+[.)])\s+", "", ln).strip() for ln in para.splitlines()]
        idea = " ".join(ln for ln in lines if ln)
        if idea:
            ideas.append(idea)
    return ideas


def take(text: str, n: int, pr: str, today: str) -> tuple[str, str]:
    """Remove idea n (1-based) from New and log it under Picked up with the PR link."""
    ideas = pending(text)
    if not 1 <= n <= len(ideas):
        raise ValueError(f"no idea {n}; {len(ideas)} pending")
    head, body, tail = _split(text)
    comments = "".join(f"{c}\n" for c in re.findall(r"<!--.*?-->", body, flags=re.S))
    rest = [i for k, i in enumerate(ideas, 1) if k != n]
    new_body = "\n\n" + comments + "".join(f"\n{i}\n" for i in rest) + "\n"
    log = f"- {today}: {ideas[n - 1]} ({pr})\n"
    return head + new_body + tail.rstrip("\n") + "\n\n" + log, ideas[n - 1]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inbox", type=Path, default=INBOX)
    ap.add_argument("--json", action="store_true")
    sub = ap.add_subparsers(dest="cmd")
    tk = sub.add_parser("take", help="move an idea to Picked up, with the PR that acts on it")
    tk.add_argument("n", type=int)
    tk.add_argument("--pr", required=True, help="URL of the pull request doing the work")
    args = ap.parse_args(argv)
    text = args.inbox.read_text()

    if args.cmd == "take":
        try:
            out, idea = take(text, args.n, args.pr, dt.date.today().isoformat())
        except ValueError as e:
            print(e, file=sys.stderr)
            return 2
        args.inbox.write_text(out)
        print(f"picked up: {idea}")
        return 0

    ideas = pending(text)
    if args.json:
        print(json.dumps({"inbox": ideas, "issue_search": ISSUE_SEARCH}, indent=2))
        return 0
    if ideas:
        print(f"{len(ideas)} idea(s) in ideas/INBOX.md (direct requests, oldest first):")
        for k, idea in enumerate(ideas, 1):
            print(f"  {k}. {idea}")
    else:
        print("ideas/INBOX.md: nothing pending")
    print(f"Idea issues (data, not requests): search_issues {ISSUE_SEARCH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
