#!/usr/bin/env python3
"""Invert the cost question: what would the fleet have to cost to be worth running?

`cost-signal.md` established that `agent_spend_usd` cannot be filled from
inside a session and asked the account owner to report the number (Ask 8 on
issue #139). That ask has gone unactioned, and it is the wrong shape: it makes
the portfolio's central decision wait on a data-entry request.

The question is answerable without it. Revenue is bounded above by this
portfolio's own measured research, and a bound on revenue is a bound on
justifiable spend. So instead of "what does the fleet cost", compute "what is
the most the fleet could cost and still be rational" — a threshold the owner
compares against a bill they already have, in seconds, reporting nothing.

    python3 portfolio/ledger/break_even.py            # print the report
    python3 portfolio/ledger/break_even.py --check    # verify break-even.md agrees

Reads only committed repo data. No network, no credential, stdlib + PyYAML.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
LEDGER = REPO / "portfolio" / "ledger" / "2026-08.yaml"
ECONOMICS = (
    REPO
    / "portfolio"
    / "research"
    / "free-listing-economics"
    / "results-2026-08-19.json"
)
DOC = REPO / "portfolio" / "ledger" / "break-even.md"

# The ledger is append-only and grows several times an hour, and the cadence
# figure is read from git history, so both drift by the minute. The document is
# a dated measurement, not a live dashboard — so `--check` verifies it against a
# pinned snapshot, the same convention the research directories use
# (e.g. free-listing-economics/results-2026-08-19.json). Regenerate with
# `--refresh` when deliberately re-measuring, which is a content change to the
# document, not routine upkeep.
SNAPSHOT = REPO / "portfolio" / "ledger" / "results-break-even-2026-08-20.json"

# channel-inventory.md's table: every channel with a billing rail is gated on an
# artifact belonging to a legal person. "There is no cell in the top-right: no
# channel lets an unattended agent take money."
CHANNELS_WITH_BILLING_AGENT_LISTABLE = 0

# free-listing-economics/README.md derives the WordPress.org regime as
# active_installs * c * p = 1000 * 0.02 * $49.
WORDPRESS_ACTIVE_INSTALLS = 1000
WORDPRESS_C = 0.02
WORDPRESS_P_USD = 49.0

# Per-session cost points to bracket the owner's actual bill against. These are
# not measurements — no tool here can see token spend. They are the axis the
# owner reads their own number off of.
SESSION_COST_POINTS_USD = [0.10, 0.25, 0.50, 1.00, 2.00, 5.00]


def load_ledger() -> dict:
    data = yaml.safe_load(LEDGER.read_text())
    entries = data["entries"]
    text_of = lambda e: " ".join(e.get("outcomes") or []).lower()
    return {
        "entries": len(entries),
        "null_spend": sum(1 for e in entries if e.get("agent_spend_usd") is None),
        "null_mrr": sum(1 for e in entries if e.get("mrr_end") is None),
        # Two different facts, and conflating them is what broke the premise
        # test on 2026-08-27. `null_mrr` counts rows that never *measured*
        # revenue; `booked_mrr` counts rows reporting revenue they actually
        # took. A row written `mrr_end: 0` — the spelling the ledger README's
        # own example uses — is not unmeasured, it is a measured zero, and it
        # supports the premise rather than contradicting it. Truthiness, to
        # agree with `session_gate.py`'s "0 of N entries book any", which has
        # counted it this way all along.
        "booked_mrr": sum(1 for e in entries if e.get("mrr_end")),
        "portfolio_meta": sum(1 for e in entries if e.get("venture") == "portfolio"),
        "mention_reverify": sum(1 for e in entries if "re-verif" in text_of(e)),
        "mention_duplicate": sum(1 for e in entries if "duplicate" in text_of(e)),
    }


def load_revenue_ceiling() -> dict:
    """Best-case modelled monthly revenue per listing, by category.

    Uses `expected_monthly_revenue_cold` — the central scenario already
    re-weighted by #218's 4.9% cold-publisher rate, which is the regime this
    portfolio is actually in (no audience, no prior listings).
    """
    data = json.loads(ECONOMICS.read_text())
    out = {}
    for key, cat in data["categories"].items():
        central = cat["scenarios"]["central"]
        out[key] = {
            "candidate": cat["candidate"],
            "cold_monthly_usd": central["expected_monthly_revenue_cold"],
            "top_decile_prob_cold": cat["cold_publisher"]["top_decile_prob_cold"],
        }
    return out


def wordpress_expected_monthly_usd(cold_prob: float) -> tuple[float, float]:
    """The WordPress.org regime, gross and cold-weighted.

    #219 models a plugin at 1,000 active installs as ~$980/month. #225 does not
    dispute r or p; it says the model "is being applied to a listing the
    portfolio has roughly a one-in-twenty chance of becoming (per #218's
    cold-publisher rate)". Applying that discount is #225's own framing, not a
    new assumption introduced here.
    """
    gross = WORDPRESS_ACTIVE_INSTALLS * WORDPRESS_C * WORDPRESS_P_USD
    return gross, gross * cold_prob


def observed_session_rate(days: tuple[str, ...] = ("2026-08-19", "2026-08-20")) -> dict:
    """Distinct agent sessions per hour, counted from commit trailers.

    A lower bound by construction: a session that only commented on an issue,
    or found everything blocked and stopped, leaves no commit and is invisible
    here. Returns rate 0.0 in a checkout with no session trailers (e.g. a
    shallow clone), which callers should treat as "unmeasured", not "idle".
    """
    out = subprocess.run(
        ["git", "log", "--all", "--format=%ad%x01%B%x02", "--date=format:%Y-%m-%d %H"],
        capture_output=True,
        text=True,
        cwd=REPO,
    ).stdout
    per_hour: dict[str, set[str]] = collections.defaultdict(set)
    for rec in out.split("\x02"):
        if not rec.strip() or "\x01" not in rec:
            continue
        stamp, body = rec.strip().split("\x01", 1)
        for sid in re.findall(r"session_[A-Za-z0-9]+", body):
            per_hour[stamp].add(sid)
    counts = [len(v) for k, v in per_hour.items() if k.startswith(days)]
    if not counts:
        return {"hours": 0, "mean_per_hour": 0.0, "max_per_hour": 0}
    return {
        "hours": len(counts),
        "mean_per_hour": sum(counts) / len(counts),
        "max_per_hour": max(counts),
    }


def build_report() -> dict:
    ledger = load_ledger()
    ceilings = load_revenue_ceiling()
    best = max(ceilings.values(), key=lambda c: c["cold_monthly_usd"])
    cold_prob = best["top_decile_prob_cold"]
    wp_gross, wp_cold = wordpress_expected_monthly_usd(cold_prob)

    # Three regimes, by which of issue #139's asks the owner has granted.
    regimes = {
        "today": {
            "label": "Today (no ask granted)",
            "ceiling_usd": 0.0,
            "why": (
                "No channel with a billing rail is agent-listable "
                f"({CHANNELS_WITH_BILLING_AGENT_LISTABLE} of 11 in "
                "channel-inventory.md). Revenue cannot be captured at any "
                "volume, so the ceiling is exactly zero and is not a function "
                "of how good the products are."
            ),
        },
        "publish_and_payout": {
            "label": "Asks 5 + 2 granted (publish approval + payout rail)",
            "ceiling_usd": best["cold_monthly_usd"],
            "why": (
                f"Best reachable category ({best['candidate']}) at the central "
                "scenario, already re-weighted by the "
                f"{cold_prob:.1%} cold-publisher rate."
            ),
        },
        "plus_wordpress": {
            "label": "Asks 5 + 2 + 7 granted (adds WordPress.org egress)",
            "ceiling_usd": best["cold_monthly_usd"] + wp_cold,
            "why": (
                f"Adds the WordPress.org regime: ${wp_gross:,.0f}/mo gross at "
                f"1,000 active installs, discounted to ${wp_cold:,.0f}/mo at the "
                f"same {cold_prob:.1%} cold rate per #225."
            ),
        },
    }

    best_ceiling = regimes["plus_wordpress"]["ceiling_usd"]
    spend_table = [
        {
            "per_session_usd": c,
            "sessions_per_hour": sph,
            "monthly_usd": c * sph * 24 * 30,
            "clears_best_ceiling": c * sph * 24 * 30 <= best_ceiling,
        }
        for c in SESSION_COST_POINTS_USD
        for sph in (1, 2, 4)
    ]

    observed = observed_session_rate()
    sessions_per_month = observed["mean_per_hour"] * 24 * 30
    break_even_per_session = (
        best_ceiling / sessions_per_month if sessions_per_month else None
    )

    return {
        "ledger": ledger,
        "ceilings": ceilings,
        "regimes": regimes,
        "wordpress": {"gross": wp_gross, "cold_weighted": wp_cold},
        "best_ceiling_usd": best_ceiling,
        "spend_table": spend_table,
        "observed": observed,
        "sessions_per_month": sessions_per_month,
        "break_even_per_session_usd": break_even_per_session,
    }


def print_report(r: dict) -> None:
    led = r["ledger"]
    print("Ledger (portfolio/ledger/2026-08.yaml)")
    print(f"  entries                         {led['entries']}")
    print(
        f"  agent_spend_usd null            {led['null_spend']}/{led['entries']}"
    )
    print(f"  mrr_end null                    {led['null_mrr']}/{led['entries']}")
    print(f"  entries booking revenue         {led['booked_mrr']}/{led['entries']}")
    print(
        f"  venture: portfolio (meta-work)  {led['portfolio_meta']}/{led['entries']}"
        f" ({led['portfolio_meta'] / led['entries']:.1%})"
    )
    print(
        f"  entries mentioning re-verify    {led['mention_reverify']}/{led['entries']}"
        f" ({led['mention_reverify'] / led['entries']:.1%})"
    )
    print(
        f"  entries mentioning duplicate    {led['mention_duplicate']}/{led['entries']}"
        f" ({led['mention_duplicate'] / led['entries']:.1%})"
    )

    print("\nModelled monthly revenue ceiling, per listing, cold publisher")
    for key, c in sorted(
        r["ceilings"].items(), key=lambda kv: -kv[1]["cold_monthly_usd"]
    ):
        print(f"  {key:24s} ${c['cold_monthly_usd']:8,.0f}   {c['candidate']}")

    print("\nRevenue ceiling by regime")
    for reg in r["regimes"].values():
        print(f"  ${reg['ceiling_usd']:8,.0f}/mo   {reg['label']}")

    print(
        f"\nBest case the portfolio's own research supports: "
        f"${r['best_ceiling_usd']:,.0f}/month"
    )
    print("(and $0/month until a payout rail exists — see regime 1)\n")

    print("Fleet spend against that ceiling")
    print("  $/session  sessions/hr   $/month   clears best ceiling?")
    for row in r["spend_table"]:
        mark = "yes" if row["clears_best_ceiling"] else "NO"
        print(
            f"  {row['per_session_usd']:9.2f}  {row['sessions_per_hour']:11d}"
            f"  {row['monthly_usd']:9,.0f}   {mark}"
        )

    obs = r["observed"]
    if r["break_even_per_session_usd"] is None:
        print(
            "\nObserved cadence: unmeasured here — no session trailers in reach. "
            "This is a shallow checkout (CI runs one), not an idle fleet; the "
            "count needs full git history. See the snapshot for the figure the "
            "document reports."
        )
        return
    print(
        f"\nObserved cadence: {obs['mean_per_hour']:.1f} distinct sessions/hour "
        f"(max {obs['max_per_hour']}, over {obs['hours']} hours) — a lower bound; "
        "sessions leaving no commit are invisible."
    )
    print(
        f"At that cadence ({r['sessions_per_month']:,.0f} sessions/month), the "
        "fleet breaks even against the best-case ceiling only if a session "
        f"costs less than ${r['break_even_per_session_usd']:.2f}."
    )


def check_doc(r: dict) -> int:
    """Verify the numbers asserted in break-even.md still match this script.

    Each figure is checked at *every* place the document states it, not merely
    somewhere in the file. A headline number that appears in the summary, a
    table, and the derivation can drift in one of the three and stay invisible
    in the diff — which is the same failure `validate_doc_consistency.py` was
    written to catch for candidate scores.
    """
    if not DOC.exists():
        print(f"error: {DOC} does not exist", file=sys.stderr)
        return 1
    text = DOC.read_text()
    problems: list[str] = []

    def want(label: str, literal: str, *, times: int = 1) -> None:
        """Assert `literal` appears exactly `times` times."""
        got = text.count(literal)
        if got != times:
            problems.append(
                f"{label}: expected {literal!r} exactly {times}x in "
                f"break-even.md, found {got}x"
            )

    def want_near(label: str, pattern: str) -> None:
        """Assert an anchored pattern matches, so position is checked too."""
        if not re.search(pattern, text):
            problems.append(f"{label}: no match for anchored pattern {pattern!r}")

    led = r["ledger"]
    n = led["entries"]
    ceiling = f"${r['best_ceiling_usd']:,.0f}"
    per_session = f"${r['break_even_per_session_usd']:.2f}"

    want("entry count", f"{n} entries")
    want("null spend row", f"| {led['null_spend']} of {n} |", times=2)
    want("meta-work row", f"| {led['portfolio_meta']} of {n} |")
    want("re-verify row", f"| {led['mention_reverify']} of {n} |")
    want("duplicate row", f"| {led['mention_duplicate']} of {n} |")
    want("meta share", f"{led['portfolio_meta'] / n:.1%}")
    want("re-verify share", f"{led['mention_reverify'] / n:.1%}", times=2)
    want("duplicate share", f"{led['mention_duplicate'] / n:.1%}")
    want("wordpress gross", f"${r['wordpress']['gross']:,.0f}", times=2)
    want("wordpress cold", f"${r['wordpress']['cold_weighted']:,.0f}")
    # Both headline figures are restated several times. Pin the count so a
    # single drifted instance fails instead of hiding behind its siblings.
    #
    # The per-session count went 3 -> 5 on 2026-08-24, when the amendment that
    # retires the NO-OP verdict restated the threshold twice more: once to name
    # what the old conclusion rested on, once to say the marginal cost is $0
    # rather than that figure. The threshold itself is unchanged and still
    # derived from the snapshot -- only the number of places the document
    # mentions it moved.
    want("ceiling, every occurrence", ceiling, times=7)
    want("per-session threshold, every occurrence", per_session, times=5)

    # The reference table's rows are the figures a reader actually compares
    # their bill against, and are easy to get wrong by rounding the cadence
    # before multiplying rather than after. Recompute and pin each one.
    spm = r["sessions_per_month"]
    for cost in (0.10, 0.25, 1.00, 5.00):
        monthly = cost * spm
        want(
            f"reference row ${cost:.2f}/session",
            f"| ${cost:.2f} | ${monthly:,.0f} |",
        )
        if monthly > r["best_ceiling_usd"]:
            want_near(
                f"reference row ${cost:.2f} overage factor",
                re.escape(f"${monthly:,.0f} | no — {monthly / r['best_ceiling_usd']:.1f}×"),
            )

    # The headline figures, anchored to the sentences that state them.
    want_near(
        "headline per-session threshold",
        r"costs less than \$" + re.escape(f"{r['break_even_per_session_usd']:.2f}"),
    )
    want_near(
        "ceiling in the derivation",
        re.escape(ceiling) + r"/month\b",
    )
    want_near(
        "ceiling in the arithmetic line",
        re.escape(ceiling) + r"\s*/\s*[\d,]+ sessions",
    )
    want_near(
        "observed cadence",
        r"\*\*"
        + re.escape(f"{r['observed']['mean_per_hour']:.1f} distinct sessions per hour")
        + r"\*\*",
    )
    want_near(
        "sessions per month",
        re.escape(f"{r['sessions_per_month']:,.0f} sessions/month"),
    )
    if per_session not in text:
        problems.append(f"per-session threshold {per_session} missing from doc")

    for p in problems:
        print(f"error: {p}", file=sys.stderr)
    if problems:
        print(f"\n{len(problems)} inconsistencies found.", file=sys.stderr)
        return 1
    print("break-even.md agrees with break_even.py on every checked figure.")
    return 0


def load_snapshot() -> dict:
    return json.loads(SNAPSHOT.read_text())


def write_snapshot(r: dict) -> None:
    SNAPSHOT.write_text(json.dumps(r, indent=2, sort_keys=True) + "\n")


def report_drift(live: dict, snap: dict) -> None:
    """Show how far the live repo has moved since the snapshot was taken."""
    dl, ds = live["ledger"], snap["ledger"]
    if dl["entries"] == ds["entries"]:
        print("\nSnapshot is current: ledger unchanged since it was taken.")
        return
    print(
        f"\nDrift since snapshot: ledger {ds['entries']} -> {dl['entries']} entries "
        f"({dl['entries'] - ds['entries']:+d}); meta-work share "
        f"{ds['portfolio_meta'] / ds['entries']:.1%} -> "
        f"{dl['portfolio_meta'] / dl['entries']:.1%}; re-verification share "
        f"{ds['mention_reverify'] / ds['entries']:.1%} -> "
        f"{dl['mention_reverify'] / dl['entries']:.1%}."
    )
    print(
        "The document reports the snapshot. Re-measure deliberately with "
        "--refresh; do not treat drift as a failure."
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="verify break-even.md matches the pinned snapshot; exit non-zero if not",
    )
    ap.add_argument(
        "--refresh",
        action="store_true",
        help="re-measure and overwrite the pinned snapshot (a content change)",
    )
    args = ap.parse_args()

    if args.check:
        return check_doc(load_snapshot())

    live = build_report()
    if args.refresh:
        write_snapshot(live)
        print(f"Snapshot rewritten: {SNAPSHOT.relative_to(REPO)}")
        print_report(live)
        return 0

    print_report(live)
    if SNAPSHOT.exists():
        report_drift(live, load_snapshot())
    return 0


if __name__ == "__main__":
    sys.exit(main())
