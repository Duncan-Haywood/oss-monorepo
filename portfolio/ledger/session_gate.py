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

Reads committed repo data and `git log`, plus one `git fetch origin main`
issued by this script itself (read-only, no credential beyond the repo access
the session already has) — see `refresh_origin_main`'s docstring for why that
fetch turned out not to be optional.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
LEDGER = REPO / "portfolio" / "ledger" / "2026-08.yaml"
SNAPSHOT = REPO / "portfolio" / "ledger" / "results-break-even-2026-08-20.json"
CANDIDATES = REPO / "portfolio" / "pipeline" / "candidates.yaml"

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

# `CLAUDE.md`'s ledger-discipline section already says "don't add an entry the
# latest one already covers" -- in prose, read only by a session that scrolls
# to it. Measured directly on 2026-08-22: entries whose outcomes include
# "checked the same open PRs, still all correctly gated" and record no other
# action are not a handful, they're dozens, because each session re-derives
# "was this covered already?" by skimming the ledger tail rather than being
# told. This pattern is the boilerplate those entries converged on
# independently -- it also appears, harmlessly, as a preamble sentence in
# entries that go on to do real work (this check runs a matched clause
# against the joined outcome text, not against the whole entry, so it cannot
# tell "this is all the entry says" from "the entry mentions this and then
# does something else"). The streak this drives is a coarse, cheap-to-compute
# proxy for the waste, not a precise count of contentless entries -- read it
# as "this clause recurred N times in a row", not as "N sessions did nothing".
#
# Two things the first draft got wrong, both measured on the real ledger on
# 2026-08-23, and both of which made the streak read 0 while the trailing
# entries did carry the clause:
#
#   1. It anchored on the single verb "checked". Sessions write the identical
#      sentence as "Listed the 4 open PRs (...)", "Re-checked", "Reviewed" --
#      19 of the ledger's 73 instances use a synonym, including the two most
#      recent. A detector for boilerplate that a synonym defeats reports the
#      absence of boilerplate.
#   2. It spanned the gap between clauses with `[^.]`, meaning "stay inside
#      one sentence". In this ledger's prose a period is not a sentence
#      boundary: the same sentence routinely names `verification_status.py`,
#      `2026-08.yaml`, `next@16.3.1`. Any of those truncated the span and
#      dropped the match. A period only ends a sentence here when whitespace
#      (or the text) follows it, which is what SENTENCE_GAP encodes.
#
# Combined, these under-counted by 26% (54 matches -> 73) and, more to the
# point, silenced the advisory on exactly the entries it exists to catch.
SENTENCE_GAP = r"(?:[^.]|\.(?=\S))"
STALE_PR_CHECK_PATTERN = re.compile(
    r"(?:re-?checked|checked|listed|reviewed|surveyed) the \d+ (?:\w+[- ])*open prs?"
    r"\s*\([^)]*\)" + SENTENCE_GAP + r"{0,220}?"
    r"(?:all|nothing)" + SENTENCE_GAP + r"{0,150}?"
    r"(?:correctly (?:human|owner)-gated|nothing (?:to consolidate|overlapping|new to add|touched)"
    r"|already correctly)",
    re.I,
)

# Measured on 2026-08-22: a single trailing run reached 11-21 consecutive
# entries doing nothing but this recheck before the PR set itself changed.
# Five is comfortably inside that range and well above what a genuine
# coincidence (two sessions landing back to back) would produce.
STALE_PR_STREAK_THRESHOLD = 5


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


def stale_pr_check_streak(entries: list[dict]) -> int:
    """Count trailing entries whose outcomes include the "checked the open PRs,
    still unchanged and correctly gated" clause. Stops at the first entry
    (scanning from the newest) whose outcomes don't contain that clause at
    all. It does NOT verify the clause is all an entry says -- an entry that
    mentions it in passing and then does real work still counts, so this is a
    lower bound on "entries carrying this recheck", not a count of entries
    that did nothing else. Empty ledger, or a most-recent entry that omits the
    clause entirely, both correctly read as 0.
    """
    streak = 0
    for e in reversed(entries):
        text = " ".join(str(o) for o in (e.get("outcomes") or []))
        if not STALE_PR_CHECK_PATTERN.search(text):
            break
        streak += 1
    return streak


def refresh_origin_main(timeout: float = 20.0) -> bool:
    """Best-effort `git fetch origin main`. Returns whether it succeeded.

    #600 fixed the case where `origin/main` points at the right commit but a
    shallow clone truncates the history behind it. It did not fix a cheaper
    way for the same false PROCEED to happen: a container's initial checkout
    can leave the local `origin/main` ref itself stale — pointing at a commit
    from days or weeks ago — without the depth being shallow at all. Measured
    live on 2026-08-22: a fresh session's un-fetched `origin/main` sat at a
    2026-07-29 commit, 878 commits behind the true tip. Its reachable history
    still spanned far more than 24 hours (that old commit has deep history
    behind it), so `history_span_hours` read it as reliable — `git log
    --since=24 hours ago` against that stale ref then correctly found zero
    commits in *its* last 24 hours and reported 0.00 sessions/hour, a real
    answer to the wrong question. Shallowness and staleness fool the same
    reliability check in opposite ways, so the check cannot tell them apart
    after the fact; the only fix is to make `origin/main` fresh before reading
    it, which is what this does.

    Failure (offline, no remote configured, network denied) is swallowed —
    callers treat a failed refresh as another reason not to trust the reading,
    not as a crash.
    """
    try:
        result = subprocess.run(
            ["git", "fetch", "origin", "main", "--quiet"],
            cwd=REPO,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    return result.returncode == 0


def history_span_hours(commit_timestamps: list[int]) -> float:
    """Hours from the oldest of the given commit timestamps to now."""
    if not commit_timestamps:
        return 0.0
    return (time.time() - min(commit_timestamps)) / 3600


def commit_timestamps() -> list[int]:
    """Unix timestamps of every commit currently reachable from origin/main.

    On a shallow clone this is bounded by the clone's depth, not by time —
    exactly the quantity `sessions_per_hour` needs to tell "24h of real
    history" apart from "however many commits the shallow fetch happened to
    include".
    """
    out = subprocess.run(
        ["git", "log", "origin/main", "--pretty=%ct"], cwd=REPO, capture_output=True, text=True
    )
    return [int(line) for line in out.stdout.split() if line]


def sessions_per_hour(hours: int = 24) -> tuple[float, bool]:
    """Distinct session trailers on main per hour, and whether that count is trustworthy.

    A fresh session in this environment gets a shallow clone (see the repo's
    own environment notes). `git log --since` on a shallow repo does not error
    or warn when the window it's asked for reaches past the shallow boundary —
    it just returns whatever commits happen to be present, which silently
    undercounts recent activity rather than reporting the true absence of it.
    Measured directly: a session_gate.py run against this session's own
    as-cloned shallow checkout read 0.00 sessions/hour on a period the ledger
    shows ran at roughly 2.7/hour once the clone was deepened — a false
    "maintenance rate" reading that would have cleared the gate to PROCEED on
    an artifact of the checkout, not on the fleet's actual cadence.

    The second element is False whenever the local history doesn't reach back
    the full window, so callers can refuse to let an undercounted reading
    clear the gate.
    """
    out = subprocess.run(
        ["git", "log", "origin/main", f"--since={hours} hours ago", "--pretty=%B"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    sessions = set(re.findall(r"session_[A-Za-z0-9]+", out.stdout))
    cadence = len(sessions) / hours
    reliable = history_span_hours(commit_timestamps()) >= hours
    return cadence, reliable


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


def routable(venture: str) -> bool:
    """Whether `portfolio/router/` can see this venture directory at all.

    A `VENTURE.yaml` is necessary but not sufficient. `allocate.py` skips any
    directory carrying a `NOT-A-VENTURE` marker, and `test_allocate.py` pins
    that the marker wins over a `VENTURE.yaml` in the same directory —
    `ventures/ai-first-markets/` currently carries both. So a graduation check
    that reads only for `VENTURE.yaml` can call a candidate graduated into a
    directory no budget will ever reach.
    """
    d = REPO / "ventures" / venture
    # `.is_file()`, not `.exists()`: allocate.py:229 and validate.py:114 both
    # test the manifest with `is_file()`, so a directory (or anything else)
    # named VENTURE.yaml is invisible to the router. Mirroring the predicate is
    # the whole point of this helper.
    return (d / "VENTURE.yaml").is_file() and not (d / "NOT-A-VENTURE").is_file()


def build_targets() -> list[dict] | None:
    """Candidates carrying a `build-now` verdict that nobody has built yet.

    Graduation is a fact on disk, not a note in a table: a candidate with
    `graduate_as: venture` has graduated once its own venture directory is
    routable; one with `graduate_as: product-line` has graduated once its host
    venture is routable *and* lists the slug under `product_lines`. Whatever is
    left is work the pipeline already decided to do and no session has done.

    **Returns `None` when the pipeline could not be read**, which is not the
    same fact as an empty list and must not collapse into one. An empty list
    means "read it, nothing eligible" and legitimately routes a session to
    researching a new candidate; a missing or malformed `candidates.yaml` means
    the gate does not know, and sending a session off to research on that basis
    would invent work while real `build-now` items sit unbuilt.
    """
    try:
        doc = yaml.safe_load(CANDIDATES.read_text())
        candidates = doc["candidates"]
    except (OSError, yaml.YAMLError, KeyError, TypeError, AttributeError):
        return None
    # Must be a *list*, not merely iterable and not `null`. A mapping or a
    # string satisfies `iter()` and then contributes no records to the loop
    # below; `candidates: null` is rejected outright by validate_candidates.py.
    # Normalising any of those to [] would answer "read it, nothing eligible"
    # for a file that is in fact malformed -- exactly the confusion this None
    # return exists to prevent.
    if not isinstance(candidates, list):
        return None

    scored: list[tuple[float, dict]] = []
    for c in candidates:
        # A scalar or nested-list entry is a malformed record, not an ineligible
        # one. Skipping it would land in the same "read it, nothing eligible"
        # answer as a clean empty pipeline and send a session off to research.
        if not isinstance(c, dict):
            return None
        if c.get("verdict") != "build-now":
            continue

        # Each field below builds a filesystem path or the BUILD instruction
        # itself, so a build-now record missing one cannot produce a usable
        # target: `str(None)` would name `ventures/None/`, and an unset
        # `graduate_as` would silently take the venture path. Report the
        # pipeline unreadable rather than emit an instruction nobody can follow.
        slug = c.get("slug")
        if not isinstance(slug, str) or not slug:
            return None
        graduate_as = c.get("graduate_as")
        if graduate_as not in ("venture", "product-line"):
            return None
        # `name` and `doc` are not path components, but they are interpolated
        # into the same instruction, where a missing one reads as the literal
        # "None" -- and `doc` becomes a brief at `portfolio/pipeline/None`,
        # which is worse than no pointer because it looks like one.
        # validate_candidates.py does not require either field.
        if not all(isinstance(c.get(k), str) and c.get(k) for k in ("name", "doc")):
            return None
        try:
            # Coerced, because validate_candidates.py:73 normalises with
            # float() and so accepts a quoted numeric composite. A missing or
            # unparseable one is malformed data, though -- not a zero.
            composite = float(c["composite"])
        except (KeyError, TypeError, ValueError):
            return None

        if graduate_as == "product-line":
            host = c.get("host_venture")
            if not isinstance(host, str) or not host:
                return None
            if not routable(host):
                scored.append((composite, c))  # nothing routable to graduate into
                continue
            try:
                parsed = yaml.safe_load((REPO / "ventures" / host / "VENTURE.yaml").read_text())
                listed = (parsed or {}).get("product_lines")
            except (OSError, yaml.YAMLError, AttributeError):
                listed = None
            # A non-list `product_lines` (`true`, say) would raise inside any()
            # and take the whole gate down with it.
            if not isinstance(listed, list):
                listed = []
            if any((p.get("slug") if isinstance(p, dict) else p) == slug for p in listed):
                continue
        elif routable(slug):
            continue
        scored.append((composite, c))

    return [c for _, c in sorted(scored, key=lambda pair: pair[0], reverse=True)]


def verdict(
    *,
    revenue: bool,
    meta: float,
    cadence: float,
    cadence_reliable: bool = True,
    targets: list[dict] | None = None,
) -> tuple[str, list[str]]:
    """Route a generic scheduled session into a lane. Never stops one.

    This used to return NO-OP — "the highest-value output of your session is
    nothing" — on `break-even.md`'s reasoning: no revenue means a $0 ceiling on
    justifiable spend, so a session that cannot book revenue should not run.
    The account owner corrected the premise on 2026-08-24. Fleet capacity is
    bought as a flat subscription, so the marginal cash cost of a session that
    is already running is not $0.12, it is $0; idle capacity is not a saving,
    it is the waste. And a gate cannot refund a session either way — by the
    time this script runs the container is provisioned, the repo is cloned and
    the tokens are spent. NO-OP only ever suppressed the *output* of a session
    that had already been paid for.

    The cadence reading no longer participates in the verdict at all. It was
    the input that made the old verdict depend on `git log` depth: a shallow
    clone (the default for a fresh session here) left cadence unmeasurable, the
    cadence branch was skipped rather than cleared, and the session fell
    through to NO-OP. Two sessions seconds apart got opposite verdicts on
    identical facts, decided by how many commits their container happened to
    fetch. Cadence stays in the report as a collision signal — see the burst
    warning — but it gates nothing, so clone depth cannot decide a lane.
    """
    if revenue:
        return "PROCEED", ["Revenue is recorded this month — work the venture that is earning."]
    if meta < META_SHARE_THRESHOLD:
        return "PROCEED", [
            f"Recent meta-work share {meta:.0%} is below the {META_SHARE_THRESHOLD:.0%} "
            "threshold — the fleet is spending on ventures, not on itself. Continue as briefed.",
            "Deploy-first still applies: if the venture you are on already has a built "
            "surface with no public URL, that deploy is the work. Do not start a sibling "
            "product. See `portfolio/DIRECTION.md` Current priority.",
        ]
    reasons = [
        f"{meta:.0%} of the last {WINDOW} ledger entries are portfolio meta-work, not venture "
        "work, and no revenue is recorded. The fleet is debating process instead of shipping "
        "products — that stops here.",
        "Build product value: features, runnable apps, usage tracking, niche landing pages. "
        "Do not re-verify PRs, expand the decision queue, or write ledger entries that "
        "record looking without shipping.",
        "Deploy-first: a product already on `main` with no public URL outranks a new "
        "`build-now` candidate. Prepare the live URL; the owner flip is `deploy-settings` "
        "(do not open a second ask). See `portfolio/DIRECTION.md` Current priority.",
    ]
    targets = build_targets() if targets is None else targets
    if targets is None:
        reasons.append(
            f"`{CANDIDATES.relative_to(REPO)}` could not be read or parsed, so the gate cannot "
            "tell which candidates are unbuilt. Fix that first — do not read this as an empty "
            "pipeline and go research a new candidate, which is how an unreadable file turns "
            "into invented work while real `build-now` items sit untouched."
        )
    elif targets:
        t = targets[0]
        where = (
            f"a product line inside `ventures/{t.get('host_venture')}/`"
            if t.get("graduate_as") == "product-line"
            else f"a new venture at `ventures/{t.get('slug')}/`"
        )
        reasons.append(
            f"Start here: {t.get('name')} ({t.get('slug')}) — scored "
            f"{t.get('composite')}, `build-now` verdict, not built yet. Graduate as {where} "
            f"and ship a free full-feature MVP with usage stats. Brief: "
            f"`portfolio/pipeline/{t.get('doc')}`. See `portfolio/DIRECTION.md`."
        )
        if len(targets) > 1:
            rest = ", ".join(str(c.get("slug")) for c in targets[1:])
            reasons.append(f"Also carrying an unbuilt `build-now` verdict: {rest}.")
    else:
        reasons.append(
            "No `build-now` candidate is unbuilt — pick a super-niche product not in "
            "`portfolio/pipeline/screened-out.md`, score it, graduate it, and ship. "
            "Prefer ideas that run on this VM with low variable cost."
        )
    return "BUILD", reasons


def report(
    entries: list[dict],
    cadence: float,
    burst: int = 0,
    cadence_reliable: bool = True,
    origin_fetched: bool = True,
    targets: list[dict] | None = None,
) -> dict:
    revenue = revenue_recorded(entries)
    meta = meta_share(entries)
    reverif = reverification_share(entries)
    stale_streak = stale_pr_check_streak(entries)
    call, reasons = verdict(
        revenue=revenue,
        meta=meta,
        cadence=cadence,
        cadence_reliable=cadence_reliable,
        targets=targets,
    )
    if burst >= BURST_THRESHOLD_SESSIONS:
        reasons = reasons + [
            f"{burst} distinct sessions committed to main within a "
            f"{BURST_WINDOW_MINUTES}-minute window in the last {BURST_LOOKBACK_HOURS}h — "
            "a 24h average won't show this. Before starting new work, check open PRs, "
            "branches, and issue #139 for what those sessions are already doing, and "
            "re-check `main` immediately before pushing or opening a PR."
        ]
    if stale_streak >= STALE_PR_STREAK_THRESHOLD:
        reasons = reasons + [
            f"The last {stale_streak} ledger entries in a row included "
            "'checked the open PRs, still unchanged and correctly gated' — that check "
            "has already been answered that many times over. If your own check agrees "
            "nothing changed, don't write an entry just to say so again; only add one "
            "if you found something the latest entry doesn't have (a new PR, a changed "
            "finding, or an action you actually took)."
        ]
    return {
        "verdict": call,
        "reasons": reasons,
        "entries_total": len(entries),
        "revenue_recorded": revenue,
        "meta_share_recent": round(meta, 4),
        "reverification_share_recent": round(reverif, 4),
        "sessions_per_hour": round(cadence, 4),
        "cadence_reliable": cadence_reliable,
        "origin_fetched": origin_fetched,
        "window": WINDOW,
        "max_concurrent_sessions": burst,
        "burst_window_minutes": BURST_WINDOW_MINUTES,
        "burst_lookback_hours": BURST_LOOKBACK_HOURS,
        "stale_pr_check_streak": stale_streak,
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
        "(collision signal only — gates nothing)"
        + ("" if r["cadence_reliable"] else " [undercounted -- see note]"),
        f"  peak concurrent sessions ....... {r['max_concurrent_sessions']} within any "
        f"{r['burst_window_minutes']}-min window (last {r['burst_lookback_hours']}h)",
        f"  stale open-PR-check streak ..... {r['stale_pr_check_streak']} trailing entries "
        f"with nothing new (flag at {STALE_PR_STREAK_THRESHOLD})",
        f"  break-even ..................... "
        + (f"${be:.2f} per session" if be is not None else "unknown"),
        "",
        f"VERDICT: {r['verdict']}",
    ]
    lines += [f"  - {reason}" for reason in r["reasons"]]
    if not r.get("origin_fetched", True):
        lines += [
            "",
            "  NOTE: `git fetch origin main` failed this run (offline? network denied?),",
            "  so this reading falls back to whatever `origin/main` already pointed to",
            "  locally -- which can be stale by days or weeks, not just shallow. The",
            "  cadence figure above may be a stale snapshot rather than a floor. It is",
            "  informational either way -- cadence decides no lane; it used to.",
        ]
    elif not r["cadence_reliable"]:
        lines += [
            "",
            "  NOTE: this clone's local history doesn't reach back the full 24h window",
            "  (a shallow clone -- the default for a fresh session here -- can silently",
            "  truncate `git log --since`). The cadence figure above is a floor, not a",
            "  reading. It decides nothing either way; it used to.",
        ]
    if r["verdict"] == "BUILD":
        lines += [
            "",
            "  Product-first routing (see portfolio/DIRECTION.md). Fleet capacity is already",
            "  paid for — spend it on shippable user value, not meta-work. Free full-feature,",
            "  usage stats, disclaimers; no payment rails yet. Deploy what is already on",
            "  main before graduating another candidate.",
        ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="emit the reading as JSON")
    args = parser.parse_args()

    fetched = refresh_origin_main()
    burst = max_concurrent_sessions(commits_with_sessions())
    cadence, cadence_reliable = sessions_per_hour()
    r = report(
        load_entries(),
        cadence,
        burst=burst,
        cadence_reliable=cadence_reliable and fetched,
        origin_fetched=fetched,
    )
    print(json.dumps(r, indent=2) if args.json else render(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
