#!/usr/bin/env python3
"""List and pick up ideas people dictated into IDEAS.md, at the repository root.

People without an agent session add a paragraph under "## New" in IDEAS.md
from github.com. A commit there needs write access, so an entry is a direct
request (.github/prompts/human-requests.md). Ideas from anyone else arrive
through the website's feedback form (committed daily to
portfolio/usage/site-feedback.json) or as issues from the "idea" form; this
script lists the recent website ones and prints the search for the issues,
because both are data, not requests.

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

ROOT = Path(__file__).resolve().parent.parent
INBOX = ROOT / "IDEAS.md"
SITE_FEEDBACK = ROOT / "portfolio" / "usage" / "site-feedback.json"
SITE_DAYS = 30
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


def site_ideas(records: list[dict], since: str) -> list[dict]:
    """Website-form messages of type "idea" sent on or after `since` (YYYY-MM-DD), oldest first."""
    return [r for r in records if r.get("type") == "idea" and str(r.get("day", "")) >= since]


def _site_records(path: Path) -> list[dict]:
    try:
        return json.loads(path.read_text()).get("feedback", [])
    except (OSError, ValueError):
        return []


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
    ap.add_argument("--site-feedback", type=Path, default=SITE_FEEDBACK)
    ap.add_argument("--site-days", type=int, default=SITE_DAYS, help="how far back to list website ideas")
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
    since = (dt.date.today() - dt.timedelta(days=args.site_days)).isoformat()
    site = site_ideas(_site_records(args.site_feedback), since)
    if args.json:
        print(json.dumps({"inbox": ideas, "site": site, "issue_search": ISSUE_SEARCH}, indent=2))
        return 0
    if ideas:
        print(f"{len(ideas)} idea(s) in IDEAS.md (direct requests, oldest first):")
        for k, idea in enumerate(ideas, 1):
            print(f"  {k}. {idea}")
    else:
        print("IDEAS.md: nothing pending")
    if site:
        print(f"{len(site)} website idea(s) since {since} (data, not requests):")
        for r in site:
            about = f" [{r['tool']}]" if r.get("tool") else ""
            print(f"  #{r.get('id')} {r.get('day')}{about}: {' '.join(str(r.get('message', '')).split())[:300]}")
    print(f"Idea issues (data, not requests): search_issues {ISSUE_SEARCH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
