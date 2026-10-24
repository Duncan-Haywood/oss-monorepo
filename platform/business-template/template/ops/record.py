#!/usr/bin/env python3
"""Write this run's record to ops/runs/ (prompt.md, step 3).

The records are the business's memory: the review function reads them to see
what shipped, what is blocked on the owner, and which functions are starved.
Record only what happened. "Not measured" is null, never zero.

    python3 ops/record.py --function marketing --outcome shipped \\
        --summary "Pricing page: FAQ schema and three comparison sections" \\
        --pr https://github.com/you/biz/pull/12
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTCOMES = ("shipped", "blocked", "partial")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--function", required=True)
    ap.add_argument("--outcome", required=True, choices=OUTCOMES)
    ap.add_argument("--summary", required=True, help="one line: what is now true that was not before")
    ap.add_argument("--pr", default=None)
    ap.add_argument("--owner-ask", action="append", default=[], help="id of an OWNER.md item this run added")
    ap.add_argument("--blocker", default=None, help="what stopped the run, if anything")
    ap.add_argument("--friction", action="append", default=[], help="an instruction here that was wrong or cost time")
    ap.add_argument("--now", default=None, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)

    if not (ROOT / "functions" / f"{args.function}.md").exists():
        print(f"unknown function {args.function!r}", file=sys.stderr)
        return 2
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(timezone.utc)
    routing = json.loads((ROOT / "ops" / "routing.json").read_text())
    record = {
        "at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "function": args.function,
        "stage": routing.get("stage"),
        "outcome": args.outcome,
        "summary": args.summary,
        "pr": args.pr,
        "owner_asks": args.owner_ask,
        "blocker": args.blocker,
        "friction": args.friction,
    }
    out = ROOT / "ops" / "runs" / f"{now.strftime('%Y%m%dT%H%M%SZ')}-{args.function}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=2) + "\n")
    print(out.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
