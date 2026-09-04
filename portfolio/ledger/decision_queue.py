#!/usr/bin/env python3
"""Print the account owner's decision queue, collapsed and ordered by leverage.

    python3 portfolio/ledger/decision_queue.py           # the brief
    python3 portfolio/ledger/decision_queue.py --json    # machine-readable
    python3 portfolio/ledger/decision_queue.py --check   # schema, for CI

`break-even.md` establishes that this portfolio's revenue ceiling is exactly
$0 and stays there until the owner opens a payout rail. Everything a session
can do is therefore queued behind decisions only the owner can make -- which
makes the *throughput of that queue*, not the supply of work, the portfolio's
binding constraint. Between 2026-08-19 and 2026-08-24 the owner answered one
item on it.

The queue was never presented in a form that supports being answered. Issue
#139 carries it as ~82KB of prose sorted cheapest-first, and two axes that
decide the answer are absent from that sort:

  - Three of the asks are *blocked* by another ask, so granting them today
    changes nothing. `CLAUDE.md` says this of Ask 5 in prose and the table
    still lists it as available.
  - Granting a repo Settings toggle and opening a merchant-of-record account
    are adjacent rows, and are not the same kind of decision. `exposure`
    separates them.

Reading those two axes off `asks.yaml` collapses the live asks and the open
pull requests they cover into a queue of decisions, of which exactly one
moves the revenue ceiling. Product-code merges are not in this queue:
answered yes on 2026-08-25. Run the tool for the current count rather than
trusting a number in a docstring.

This is a renderer, not a judge: every ordering rule below is a fixed rank over
declared fields, so what it prints is a function of the data file and the data
file is what gets reviewed. It reads no network and no `git log`.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
ASKS = REPO / "portfolio" / "ledger" / "asks.yaml"

# What an item gates, most consequential first. This is `break-even.md`'s own
# "sorted instead by what each ask gates" ranking, not a new one: gates all
# revenue, then gates distribution but not capture, then buys information, then
# buys deployment for products that already build. Revenue leads regardless of
# how cheap the others are to grant, which is exactly what the #139 table's
# cheapest-first sort inverts.
GATES = ["revenue", "distribution", "measurement", "deployment"]

# What granting it costs the owner in risk, not in minutes.
EXPOSURES = ["none", "credential", "legal-person"]

REQUIRED = {
    "id", "asks", "prs", "gates", "exposure",
    "opened", "action", "unlocks", "blocked_by", "note",
}


def load(path: Path = ASKS) -> list[dict]:
    doc = yaml.safe_load(path.read_text())
    return doc["decisions"]


def check(decisions: list[dict]) -> list[str]:
    """Schema and referential integrity. Returns a list of problems."""
    problems: list[str] = []
    ids = [d.get("id") for d in decisions]

    for dup in {i for i in ids if ids.count(i) > 1}:
        problems.append(f"duplicate id: {dup}")

    seen_asks: dict[int, str] = {}
    seen_prs: dict[int, str] = {}

    for d in decisions:
        where = d.get("id", "<no id>")

        missing = REQUIRED - set(d)
        if missing:
            problems.append(f"{where}: missing field(s): {', '.join(sorted(missing))}")
            continue

        if d["gates"] not in GATES:
            problems.append(f"{where}: gates={d['gates']!r} not one of {GATES}")
        if d["exposure"] not in EXPOSURES:
            problems.append(f"{where}: exposure={d['exposure']!r} not one of {EXPOSURES}")

        try:
            dt.date.fromisoformat(d["opened"])
        except (TypeError, ValueError):
            problems.append(f"{where}: opened={d['opened']!r} is not YYYY-MM-DD")

        if not d["action"] or not str(d["action"]).strip():
            problems.append(f"{where}: action is empty")
        if not d["unlocks"]:
            problems.append(f"{where}: unlocks is empty")
        if not d["asks"] and not d["prs"]:
            problems.append(f"{where}: covers neither an ask nor a pull request")

        for blocker in d["blocked_by"]:
            if blocker not in ids:
                problems.append(f"{where}: blocked_by names unknown id {blocker!r}")
            if blocker == d["id"]:
                problems.append(f"{where}: blocked_by names itself")

        # An ask or PR appearing under two decisions means the collapse is
        # wrong somewhere, and the queue would double-count it.
        for n in d["asks"]:
            if n in seen_asks:
                problems.append(f"ask {n} claimed by both {seen_asks[n]} and {where}")
            seen_asks[n] = where
        for n in d["prs"]:
            if n in seen_prs:
                problems.append(f"PR {n} claimed by both {seen_prs[n]} and {where}")
            seen_prs[n] = where

    return problems


def sort_key(d: dict) -> tuple:
    # Blocked items sink below actionable ones: granting them today buys
    # nothing, so they should not sit above something that would.
    return (
        bool(d["blocked_by"]),
        GATES.index(d["gates"]),
        EXPOSURES.index(d["exposure"]),
        d["opened"],
    )


def age_days(opened: str, today: dt.date) -> int:
    return (today - dt.date.fromisoformat(opened)).days


def covers(d: dict) -> str:
    bits = []
    if d["asks"]:
        bits.append("ask " + ", ".join(str(a) for a in d["asks"]))
    if d["prs"]:
        bits.append(", ".join(f"#{p}" for p in d["prs"]))
    return "; ".join(bits)


def wrap(text: str, width: int, indent: str) -> list[str]:
    words, lines, line = str(text).split(), [], ""
    for w in words:
        if line and len(line) + 1 + len(w) > width:
            lines.append(indent + line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        lines.append(indent + line)
    return lines


def render(decisions: list[dict], today: dt.date) -> str:
    ordered = sorted(decisions, key=sort_key)
    n_asks = sum(len(d["asks"]) for d in decisions)
    n_prs = sum(len(d["prs"]) for d in decisions)
    blocked = [d for d in ordered if d["blocked_by"]]
    revenue = [d for d in ordered if d["gates"] == "revenue"]
    oldest = max(age_days(d["opened"], today) for d in decisions)

    out = ["The account owner's decision queue", ""]
    # "related", not "open". Every one of the seven pull requests this file
    # names was closed by 2026-08-27 -- six merged, one closed unmerged -- while
    # this line went on calling them open, so the queue's first sentence
    # overstated it by seven items that no longer exist. The numbers are
    # provenance: which PR raised the decision, or which one a revert is waiting
    # on. A decision does not stop being the owner's because its PR closed
    # (`funding-sponsors-live` is exactly that: merged, then reverted by #862,
    # still undecided), and it does not become theirs again because one opened.
    out.append(
        f"  {len(decisions)} decisions, collapsed from {n_asks} asks and "
        f"{n_prs} related pull requests."
    )
    out.append(f"  Oldest has waited {oldest} days.")
    out.append(
        f"  {len(revenue)} of {len(decisions)} moves the revenue ceiling off $0; "
        f"{len(blocked)} cannot be acted on yet."
    )
    out.append("")

    for i, d in enumerate(ordered, 1):
        flag = "  [blocked]" if d["blocked_by"] else ""
        out.append(
            f"{i}. {d['id']}  ({covers(d)})  gates {d['gates']}, "
            f"exposure {d['exposure']}, {age_days(d['opened'], today)}d{flag}"
        )
        action = wrap(d["action"], 68, "         ")
        out.append("     do: " + action[0].strip())
        out += action[1:]
        for u in d["unlocks"]:
            body = wrap(u, 66, "         ")
            out.append("       - " + body[0].strip())
            out += body[1:]
        if d["blocked_by"]:
            out.append("     blocked by: " + ", ".join(d["blocked_by"]))
        out.append("")

    if revenue:
        out.append(
            "Only " + ", ".join(d["id"] for d in revenue) + " changes what this "
            "portfolio can earn. The rest change what it can measure, list, or "
            "deploy -- all of which stay worth $0 until that one is answered."
        )
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="machine-readable")
    ap.add_argument("--check", action="store_true", help="validate schema only")
    ap.add_argument("--today", help="YYYY-MM-DD, for deterministic output")
    args = ap.parse_args()

    decisions = load()
    problems = check(decisions)

    for p in problems:
        print(f"asks.yaml: {p}", file=sys.stderr)

    if args.check:
        if problems:
            return 1
        print(f"asks.yaml: {len(decisions)} decisions, schema OK")
        return 0

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()

    # A bookkeeping mistake must not hide the queue. `--check` above stays
    # strict because CI needs a gate, but this is the path a person runs to
    # find out what the owner has to decide, and answering it with one
    # stderr line and nothing else is the wrong failure. On 2026-08-29 two
    # sessions added the same Hetzner-deploy ask hours apart; from that
    # merge until the duplicate was removed, every run printed `PR 1999
    # claimed by both ...` and no queue, so the deployment decisions
    # gating every live URL in the portfolio were unreadable -- because of
    # a duplicate row that changed none of them.
    #
    # So: still exit non-zero, so a script or CI job cannot mistake this
    # for a clean read, but print the queue anyway. Rendering is best
    # effort -- a duplicate `prs` entry is harmless to render, a missing
    # required field is not -- so a render that raises falls back to the
    # old behaviour rather than dumping a traceback on the owner.
    try:
        if args.json:
            print(json.dumps(
                [dict(d, age_days=age_days(d["opened"], today))
                 for d in sorted(decisions, key=sort_key)],
                indent=2,
            ))
        else:
            print(render(decisions, today))
    except (KeyError, TypeError, ValueError) as exc:
        if not problems:
            raise
        print(
            f"asks.yaml: cannot render the queue until the problems above "
            f"are fixed ({type(exc).__name__}: {exc})",
            file=sys.stderr,
        )
        return 1

    if problems:
        print(
            "\nasks.yaml: the queue above is shown despite "
            f"{len(problems)} problem(s) reported on stderr; fix them with "
            "`python3 portfolio/ledger/decision_queue.py --check`.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
