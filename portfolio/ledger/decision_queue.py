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
INFRA = REPO / "portfolio" / "ledger" / "infra_state.yaml"

# A reading older than this stops counting. It does not become "up" -- it
# becomes `unknown`, and an outage route whose prerequisite is unknown is
# reported as unverified rather than as working. The whole
# 2026-08-30..09-04 "nothing is served" episode was a stale claim being read
# as a current one, so the failure direction here is deliberate: silence
# about a prerequisite must never look like a healthy prerequisite.
#
# Three days, because both readings below are dispatch-a-workflow cheap and
# the states they track (a metered allowance, a dead cluster) can change on
# their own -- the 2026-08-26 starvation window lifted unattended at
# 00:00:53Z on the first of the month.
STALE_AFTER_DAYS = 3

UP, DOWN, UNKNOWN = "up", "down", "unknown"
VERDICTS = [UP, DOWN, UNKNOWN]

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

# Optional. `outage: true` lifts a row above the `GATES` ordering entirely.
#
# It exists because the ordering above encodes an assumption that held until
# 2026-09-04: that a `deployment` row "buys deployment for products that
# already build", i.e. that the surface those products would deploy *to* is
# working. On that date `Public surface check` (run 33887885219) measured all
# three hostnames refusing connections on 443 and 0 of 24 sampled sitemap URLs
# returning anything. With nothing served, a `revenue` row cannot earn and a
# `distribution` row cannot distribute — every other ranking in this file is
# downstream of a host answering at all, so the row that restores one outranks
# them by construction rather than by urgency.
#
# **Reserved for a measured, current loss of the public surface**, evidenced by
# a run id in the row's own text. It is not a priority flag: "this feels
# important" is what `gates` is for, and a queue where anything can jump the
# ordering is the cheapest-first #139 table again with extra steps. `check()`
# enforces the type; the narrowness is a convention this comment is the whole
# statement of.
#
# **More than one row can hold it, and on 2026-09-04 two do.** The paragraph
# above was written the same day and says "the row that restores one outranks
# them" — singular, because the repo still carried a one-surface model. #3199
# had just established there are two independent public origins: the k3s
# cluster behind `marisstella.dev`, and GitHub Pages at
# `duncan-haywood.github.io/monorepo-projects/`, which needs no cluster, no SSH
# key and no sealed Secret. `Public surface check` run 33912053750 measured
# both dark in the same sweep — the three cluster hostnames refusing
# connections on 443, and the Pages origin returning 404.
#
# The criterion is unchanged and both rows meet it on their own terms: each is
# a row that *restores a public surface*, evidenced by that run. What the
# singular phrasing hid is that they are alternatives rather than a queue. So
# the flag ranks a row against the non-outage rows; it deliberately does not
# rank the outage rows against each other, and `render()` says so rather than
# implying the first is the one to do.
OUTAGE = "outage"

# Optional. `requires: [<reading>, ...]` names shared infrastructure a restore
# route needs to be *working* before granting it changes anything.
#
# It exists because `outage: true` answers "does this row restore a public
# surface?" and nothing answered "can it, today?". Those came apart on
# 2026-09-04: `deploy-settings` reaches an origin no other row reaches, so it
# is genuinely an independent route, and it was simultaneously un-grantable,
# because the workflow that builds and publishes Pages needs a runner and
# runner assignment had stopped that evening. The banner said "do the cheapest
# first" and the cheapest bought nothing.
#
# The names must exist in `infra_state.yaml`, which holds a measured verdict
# and the run id it came from for each. `check()` enforces both the shape and
# the cross-reference, so a typo cannot silently make a route look fine.
REQUIRES = "requires"


def load(path: Path = ASKS) -> list[dict]:
    doc = yaml.safe_load(path.read_text())
    return doc["decisions"]


def load_infra(path: Path = INFRA) -> dict:
    """Measured readings of shared infrastructure. Missing file -> no readings."""
    if not path.exists():
        return {}
    doc = yaml.safe_load(path.read_text()) or {}
    return doc.get("readings") or {}


def reading(name: str, infra: dict, today: dt.date) -> tuple[str, str]:
    """(verdict, why) for one prerequisite, aging stale readings out to unknown.

    Returns `unknown` rather than `up` for anything it cannot vouch for: an
    absent entry, an unparseable date, or a measurement past
    `STALE_AFTER_DAYS`. A route is never reported as viable on the strength of
    a reading nobody took.
    """
    entry = infra.get(name)
    if not isinstance(entry, dict):
        return UNKNOWN, f"{name}: never measured"

    verdict = entry.get("verdict")
    if verdict not in VERDICTS:
        return UNKNOWN, f"{name}: verdict {verdict!r} is not one of {VERDICTS}"

    try:
        age = (today - dt.date.fromisoformat(str(entry.get("measured")))).days
    except (TypeError, ValueError):
        return UNKNOWN, f"{name}: measured={entry.get('measured')!r} is not YYYY-MM-DD"

    if age > STALE_AFTER_DAYS:
        return UNKNOWN, f"{name}: last measured {age}d ago, too stale to rely on"
    if age < 0:
        return UNKNOWN, f"{name}: measured {-age}d in the future"

    run = entry.get("run")
    stamp = f"measured {age}d ago" + (f", run {run}" if run else "")
    return verdict, f"{name}: {verdict} ({stamp})"


def viability(d: dict, infra: dict, today: dt.date) -> tuple[str, list[str]]:
    """Can granting this row actually change anything today?

    `up` only when every declared prerequisite reads up. One `down` makes the
    route `down`; otherwise any `unknown` makes it `unknown`. A row that
    declares no prerequisites is `up` -- it depends on nothing this file
    tracks, which is the honest answer rather than an optimistic one.
    """
    whys = [reading(n, infra, today) for n in d.get(REQUIRES, [])]
    verdicts = [v for v, _ in whys]
    reasons = [w for _, w in whys]
    if DOWN in verdicts:
        return DOWN, reasons
    if UNKNOWN in verdicts:
        return UNKNOWN, reasons
    return UP, reasons


def check(decisions: list[dict], infra: dict | None = None) -> list[str]:
    """Schema and referential integrity. Returns a list of problems."""
    # Omitting `infra` means "use the committed readings", not "there are
    # none". The distinction matters: `check(load())` is how CI and the
    # existing tests call this, and defaulting to an empty mapping would make
    # every legitimate `requires` look like a dangling reference.
    infra = load_infra() if infra is None else infra
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

        if OUTAGE in d and not isinstance(d[OUTAGE], bool):
            problems.append(f"{where}: {OUTAGE}={d[OUTAGE]!r} is not true or false")

        if REQUIRES in d:
            names = d[REQUIRES]
            if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
                problems.append(f"{where}: {REQUIRES}={names!r} is not a list of names")
            else:
                for n in names:
                    if n not in infra:
                        problems.append(
                            f"{where}: {REQUIRES} names {n!r}, which has no "
                            f"reading in infra_state.yaml"
                        )

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


VIABILITY_RANK = {UP: 0, UNKNOWN: 1, DOWN: 2}


def sort_key(d: dict, infra: dict | None = None, today: dt.date | None = None) -> tuple:
    # Blocked items sink below actionable ones: granting them today buys
    # nothing, so they should not sit above something that would. That test
    # stays first even for an outage row — an unblockable fix is still
    # unblockable, however badly it is wanted.
    #
    # Viability sorts *within* the outage group rather than above it, so the
    # routes stay listed together as the alternatives they are while the one
    # that can actually be taken today leads. `blocked_by` is the same
    # argument one level up: an outage route whose own infrastructure is down
    # is unblockable in precisely the sense that test already encodes, and on
    # 2026-09-04 the queue printed the un-takeable one at position 1.
    #
    # With no readings supplied every row scores `up` and the order is
    # exactly what it was before this parameter existed.
    rank = VIABILITY_RANK[UP]
    if infra and today is not None:
        rank = VIABILITY_RANK[viability(d, infra, today)[0]]
    return (
        bool(d["blocked_by"]),
        not d.get(OUTAGE, False),
        rank,
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


def render(decisions: list[dict], today: dt.date, infra: dict | None = None) -> str:
    infra = {} if infra is None else infra
    ordered = sorted(decisions, key=lambda d: sort_key(d, infra, today))
    n_asks = sum(len(d["asks"]) for d in decisions)
    n_prs = sum(len(d["prs"]) for d in decisions)
    blocked = [d for d in ordered if d["blocked_by"]]
    revenue = [d for d in ordered if d["gates"] == "revenue"]
    outage = [d for d in ordered if d.get(OUTAGE) and not d["blocked_by"]]
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
    # Said in the header rather than only in the row, because an outage row is
    # the one case where reading no further is the correct behaviour, and the
    # header is what a hurried owner reads.
    #
    # The wording splits on how many rows are flagged, and the plural case is
    # not cosmetic. The singular sentence used to be unconditional and said
    # "every other row here is downstream of a host answering at all" — true
    # when the repo believed there was one public surface, and wrong the moment
    # #3199 established there are two independent origins (the k3s cluster and
    # GitHub Pages). Two outage rows are alternative routes back, not a queue:
    # neither is downstream of the other, either one alone puts the catalogue
    # in front of a stranger, and an owner who reads "start with the first one"
    # may spend a day on the expensive route while the cheap one stays unflipped.
    # Viability is a second question the banner used to skip. "Does this row
    # restore a surface?" is `outage`; "can it, today?" is this. They came
    # apart on 2026-09-04 and the banner asserted the answer to the second
    # without ever asking it -- see REQUIRES above.
    live = [d for d in outage if viability(d, infra, today)[0] == UP]
    unusable = [d for d in outage if viability(d, infra, today)[0] != UP]

    if outage:
        ids = [d["id"] for d in outage]
        out.append("")
        if len(ids) == 1:
            body = (
                f"OUTAGE: the public surface is down. {ids[0]} comes first; "
                "every other row here is downstream of a host answering at all."
            )
        else:
            body = (
                "OUTAGE: the public surface is down. "
                + str(len(ids))
                + " routes restore one: "
                + ", ".join(ids)
                + ". They are not downstream of each other — each reaches a "
                "different origin. Every other row here is downstream of "
                "something answering at all."
            )
        out += wrap(body, 72, "  ")

        # The old banner ended "Do the cheapest first." That is right only
        # while every route can actually be taken, so it is now said only in
        # that case, and the other cases say what is in the way instead.
        if unusable and live:
            names = ", ".join(d["id"] for d in live)
            out.append("")
            out += wrap(
                "Not all of them work today. "
                + str(len(live))
                + " can be granted now and will change something: "
                + names
                + ". Do the cheapest of those. The rest are listed below with "
                "what is blocking them — granting one of those today buys "
                "nothing, however cheap it looks.",
                72, "  ",
            )
        elif unusable and not live:
            out.append("")
            out += wrap(
                "None of them works today: every route's own infrastructure "
                "is down or unmeasured (below). The queue cannot rank its way "
                "out of this — something has to be re-measured or repaired "
                "before any of these flips changes what a stranger sees.",
                72, "  ",
            )
        elif len(ids) > 1:
            out.append("")
            out += wrap(
                "Granting any one of them alone puts the catalogue in front "
                "of a stranger. Do the cheapest first.",
                72, "  ",
            )

        for d in unusable:
            verdict, reasons = viability(d, infra, today)
            out.append("")
            out += wrap(
                f"{d['id']} — {verdict}: " + "; ".join(reasons),
                70, "    ",
            )
    out.append("")

    for i, d in enumerate(ordered, 1):
        flag = "  [blocked]" if d["blocked_by"] else ("  [OUTAGE]" if d.get(OUTAGE) else "")
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
    infra = load_infra()
    problems = check(decisions, infra)

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
                [dict(d, age_days=age_days(d["opened"], today),
                      viability=viability(d, infra, today)[0])
                 for d in sorted(decisions, key=lambda d: sort_key(d, infra, today))],
                indent=2,
            ))
        else:
            print(render(decisions, today, infra))
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
