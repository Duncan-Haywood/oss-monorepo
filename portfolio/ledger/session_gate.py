#!/usr/bin/env python3
"""Answer, before a generic scheduled session does any work: is there any?

`break-even.md` establishes the economics — today's revenue ceiling is exactly
$0, the fleet breaks even only below $0.12 per session, and 48% of this month's
ledger entries record re-verifying what another session had already verified.
It ends by calling the current state incoherent: "the cadence of a portfolio
racing to capture revenue, running against a ceiling of zero."

Nothing acts on that. `CLAUDE.md` has warned about duplicate and re-derived work
since 2026-08-18, in progressively more detail, and the re-verification share
has not fallen. Prose addressed to a session that has not read it yet is the
wrong instrument; the sessions that most need the warning are the ones that
skim. This is the same finding as a command that runs in two seconds.

    python3 portfolio/ledger/session_gate.py           # print the reading
    python3 portfolio/ledger/session_gate.py --json    # machine-readable

Scope, deliberately narrow. This speaks only to a *generic* brief — "continue
work", "improve the development process", "research new projects" and their
paraphrases, the briefs that arrive on a schedule with no specific target. It
never speaks to venture work, a red CI run, a PR being driven to green, a
review comment, or a named task. Those have their own trigger and their own
value; the gate is silent about them by construction.

Unlike `break_even.py`, this reads live and is checked against no snapshot. A
dated measurement is right for a document that is read later; a gate consulted
at the top of a session is only useful if it reflects the regime the session is
actually about to spend money in.

Reads only committed repo data and `git log`. No network, no credential.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
LEDGER = REPO / "portfolio" / "ledger" / "2026-08.yaml"
SNAPSHOT = REPO / "portfolio" / "ledger" / "results-break-even-2026-08-20.json"

# Entries land several times an hour, so a whole-month share is dominated by
# history and answers "what has the fleet been", not "what is it doing now".
# Twenty-five entries is roughly the last half-day at the observed cadence.
WINDOW = 25

# Measured over this month's ledger: 25-entry meta-work windows run from 56% to
# 100%, and 29 of 140 windows sit below 70%. So this threshold is one the fleet
# does cross — it admits about a fifth of the month's windows — rather than a
# line drawn under the observed range where it could never fire.
META_SHARE_THRESHOLD = 0.70

# Counted from distinct `session_*` commit trailers on main. break-even.md
# derives 2.2/hour and treats it as a lower bound (a session that only comments
# on an issue leaves no commit). Anything at or above 1.0 is well past the
# event-driven maintenance rate the $0-ceiling branch implies.
CADENCE_THRESHOLD_PER_HOUR = 1.0

# A 24-hour average can sit well below CADENCE_THRESHOLD_PER_HOUR while several
# scheduled sessions still land within minutes of each other — that gap is
# exactly what let the npm-reachability-triage probe get independently
# re-built four times in roughly an hour on 2026-08-21 (see #596's ledger
# entry). The 24h average is the wrong instrument for that failure mode; a
# short sliding window over recent commits is the right one. Two distinct
# sessions inside 15 minutes is already the pattern those collisions showed.
BURST_WINDOW_MINUTES = 15
BURST_LOOKBACK_HOURS = 6
BURST_THRESHOLD_SESSIONS = 2

REVERIFICATION_PATTERN = re.compile(r"re-?verif|duplicate|already (?:covered|done)", re.I)


def load_entries(path: Path = LEDGER) -> list[dict]:
    return yaml.safe_load(path.read_text())["entries"]


def revenue_recorded(entries: list[dict]) -> bool:
    """True once any entry books revenue — the one reading that ends the regime."""
    return any(e.get("mrr_end") for e in entries)


def meta_share(entries: list[dict], window: int = WINDOW) -> float:
    recent = entries[-window:]
    if not recent:
        return 0.0
    return sum(1 for e in recent if e.get("venture") == "portfolio") / len(recent)


def reverification_share(entries: list[dict], window: int = WINDOW) -> float:
    recent = entries[-window:]
    if not recent:
        return 0.0
    hits = 0
    for e in recent:
        text = " ".join(str(o) for o in (e.get("outcomes") or []))
        if REVERIFICATION_PATTERN.search(text):
            hits += 1
    return hits / len(recent)


def sessions_per_hour(hours: int = 24) -> float:
    """Distinct session trailers on main per hour. Lower bound by construction."""
    out = subprocess.run(
        ["git", "log", "origin/main", f"--since={hours} hours ago", "--pretty=%B"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    sessions = set(re.findall(r"session_[A-Za-z0-9]+", out.stdout))
    return len(sessions) / hours


def commits_with_sessions(hours: float = BURST_LOOKBACK_HOURS) -> list[tuple[int, str]]:
    """(commit unix timestamp, session id) pairs for commits on main that carry one.

    Separate from `sessions_per_hour`: that one needs only the distinct-session
    count over a fixed window; burst detection needs each commit's time too, so
    it uses its own delimiters (`%x01`/`%x02`) to survive multi-line bodies.
    """
    out = subprocess.run(
        ["git", "log", "origin/main", f"--since={hours} hours ago", "--pretty=format:%ct%x01%B%x02"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    pairs: list[tuple[int, str]] = []
    for record in out.stdout.split("\x02"):
        ts_str, _, body = record.partition("\x01")
        ts_str = ts_str.strip()
        if not body or not ts_str.lstrip("-").isdigit():
            continue
        match = re.search(r"session_[A-Za-z0-9]+", body)
        if match:
            pairs.append((int(ts_str), match.group(0)))
    return pairs


def max_concurrent_sessions(
    commits: list[tuple[int, str]], window_minutes: float = BURST_WINDOW_MINUTES
) -> int:
    """Peak count of distinct sessions whose first commit falls within any
    `window_minutes` span — the reading a 24h average smooths away. Pure
    function of the commit list so it is testable without `git`."""
    first_seen: dict[str, int] = {}
    for ts, session_id in commits:
        if session_id not in first_seen or ts < first_seen[session_id]:
            first_seen[session_id] = ts
    times = sorted(first_seen.values())
    if not times:
        return 0
    window_s = window_minutes * 60
    return max(
        sum(1 for t2 in times if t1 <= t2 <= t1 + window_s)
        for t1 in times
    )


def break_even_per_session() -> float | None:
    if not SNAPSHOT.exists():
        return None
    return json.loads(SNAPSHOT.read_text()).get("break_even_per_session_usd")


def verdict(
    *,
    revenue: bool,
    meta: float,
    cadence: float,
) -> tuple[str, list[str]]:
    """NO-OP only when every condition holds. Any one of them clears the gate."""
    if revenue:
        return "PROCEED", ["Revenue is recorded this month — the $0-ceiling regime has ended."]
    if meta < META_SHARE_THRESHOLD:
        return "PROCEED", [
            f"Recent meta-work share {meta:.0%} is below the {META_SHARE_THRESHOLD:.0%} "
            "threshold — the fleet is spending on ventures, not on itself."
        ]
    if cadence < CADENCE_THRESHOLD_PER_HOUR:
        return "PROCEED", [
            f"Cadence {cadence:.2f} sessions/hour is already at the maintenance rate "
            "the $0-ceiling branch implies."
        ]
    return "NO-OP", [
        "No revenue is recorded, so the ceiling on justifiable spend is the one "
        "break-even.md derives, and it is $0.",
        f"{meta:.0%} of the last {WINDOW} ledger entries are portfolio meta-work, "
        "not venture work.",
        f"The fleet is running at {cadence:.2f} sessions/hour, far above the "
        "event-driven rate that regime implies.",
    ]


def report(entries: list[dict], cadence: float, burst: int = 0) -> dict:
    revenue = revenue_recorded(entries)
    meta = meta_share(entries)
    reverif = reverification_share(entries)
    call, reasons = verdict(revenue=revenue, meta=meta, cadence=cadence)
    if burst >= BURST_THRESHOLD_SESSIONS:
        reasons = reasons + [
            f"{burst} distinct sessions committed to main within a "
            f"{BURST_WINDOW_MINUTES}-minute window in the last {BURST_LOOKBACK_HOURS}h — "
            "a 24h average won't show this. Before starting new work, check open PRs, "
            "branches, and issue #139 for what those sessions are already doing, and "
            "re-check `main` immediately before pushing or opening a PR."
        ]
    return {
        "verdict": call,
        "reasons": reasons,
        "entries_total": len(entries),
        "revenue_recorded": revenue,
        "meta_share_recent": round(meta, 4),
        "reverification_share_recent": round(reverif, 4),
        "sessions_per_hour": round(cadence, 4),
        "window": WINDOW,
        "max_concurrent_sessions": burst,
        "burst_window_minutes": BURST_WINDOW_MINUTES,
        "burst_lookback_hours": BURST_LOOKBACK_HOURS,
        "break_even_usd_per_session": break_even_per_session(),
    }


def render(r: dict) -> str:
    be = r["break_even_usd_per_session"]
    lines = [
        "Session gate — regime reading for a generic scheduled brief",
        "",
        "  revenue recorded this month .... yes"
        if r["revenue_recorded"]
        else f"  revenue recorded this month .... none "
        f"(0 of {r['entries_total']} entries book any)",
        f"  meta-work share ................ {r['meta_share_recent']:.0%} of last "
        f"{r['window']} entries (threshold {META_SHARE_THRESHOLD:.0%})",
        f"  re-verification share .......... {r['reverification_share_recent']:.0%} of last "
        f"{r['window']} entries",
        f"  distinct sessions / hour ....... {r['sessions_per_hour']:.2f} over the last 24h "
        f"(threshold {CADENCE_THRESHOLD_PER_HOUR:.2f}, lower bound)",
        f"  peak concurrent sessions ....... {r['max_concurrent_sessions']} within any "
        f"{r['burst_window_minutes']}-min window (last {r['burst_lookback_hours']}h)",
        f"  break-even ..................... "
        + (f"${be:.2f} per session" if be is not None else "unknown"),
        "",
        f"VERDICT: {r['verdict']}",
    ]
    lines += [f"  - {reason}" for reason in r["reasons"]]
    if r["verdict"] == "NO-OP":
        lines += [
            "",
            "  For a generic brief the highest-value output is nothing: no new",
            "  analysis document, no re-verification of a PR another session already",
            "  verified, no ledger entry recording that you looked. Say what the gate",
            "  read, and stop.",
            "",
            "  This does not apply to venture work, a red CI run, a PR being driven to",
            "  green, a review comment, or any named task. Those clear the gate by",
            "  having a trigger of their own.",
        ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="emit the reading as JSON")
    args = parser.parse_args()

    burst = max_concurrent_sessions(commits_with_sessions())
    r = report(load_entries(), sessions_per_hour(), burst=burst)
    print(json.dumps(r, indent=2) if args.json else render(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
