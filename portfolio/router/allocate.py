#!/usr/bin/env python3
"""Portfolio router v1: reads ventures/*/VENTURE.yaml and produces a ranked
work queue of where the next unit of agent effort should go.

This implements the heuristic described in README.md — protected explore
budget, and treating an unmeasured venture differently from one measured at
zero. It is a read-only report over the current VENTURE.yaml files; it does
not spend anything or write anything back.

It now also reads portfolio/ledger/*.yaml to surface two informational,
display-only counts per venture — neither is part of `rank()`:

- `ledger_entries` — entries this month recorded with `venture: <name>`
  directly. A reliable count, but as of 2026-08 only ~1 in 5 entries use it;
  most sessions record an aggregated `venture: portfolio` survey entry
  instead, so this alone undercounts most ventures' actual coverage.
- `portfolio_mentions` — entries recorded under `venture: portfolio` whose
  outcome text names this venture by its exact slug. A heuristic, not a
  precise touch count (prose can mention a venture without any work
  happening, or describe work without using its exact slug), but a
  whole-word slug match against a known, distinctive set of venture names
  has a low false-positive/negative rate and is far better than the zero
  these entries otherwise contribute.

Neither count drives ranking yet — see README.md's "Attribution honesty"
section for why that next step is deliberately not automated.

Usage:
    python3 portfolio/router/allocate.py           # table
    python3 portfolio/router/allocate.py --json     # JSON work queue
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"
LEDGER_DIR = REPO_ROOT / "portfolio" / "ledger"
SCORES_PATH = REPO_ROOT / "portfolio" / "scoring" / "venture-scores.yaml"

# Stage at or beyond which a venture is no longer "early" for the protected
# explore-budget split described in README.md.
LATER_STAGES = {"revenue", "scaling"}

EXPLORE_SPLIT_LATER = 0.60
EXPLORE_SPLIT_EARLY = 0.40


@dataclass
class Venture:
    name: str
    stage: str
    mrr: Optional[float]
    monthly_cost: Optional[float]
    monthly_cap: float
    protected: bool
    kill_criteria: list = field(default_factory=list)
    hypotheses: list = field(default_factory=list)
    production_url: Optional[str] = None
    ledger_entries: int = 0
    portfolio_mentions: int = 0
    merit: Optional[float] = None

    @property
    def _first_untested(self) -> Optional[dict]:
        for h in self.hypotheses:
            if isinstance(h, dict) and h.get("status") == "untested" and h.get("claim"):
                return h
        return None

    @property
    def untested_hypothesis(self) -> Optional[str]:
        """The claim text of the first hypothesis still marked untested.

        VENTURE.yaml's hypotheses list is the venture's own record of what
        it needs to learn next. Every venture in the portfolio is currently
        unmeasured, so a generic "push toward the first real measurement"
        task is the same for all of them -- this makes that task specific.
        """
        h = self._first_untested
        return h["claim"] if h else None

    @property
    def blocker(self) -> Optional[str]:
        """Why no agent session can settle this venture's next hypothesis.

        A `customer-contact` claim is settled by a response from someone
        outside this repository -- a purchase, a signup, a download, a
        survey answer. None of that is observable while the venture has no
        `links.production`: there is nothing published for anyone to respond
        to, and publishing is the account owner's decision.

        Returning None means the next task is one a session can actually
        start. The router ranks on this, so undispatchable work stops
        occupying the top of the queue.
        """
        h = self._first_untested
        if h is None:
            return None
        if h.get("evidence") != "customer-contact":
            return None
        if self.production_url:
            return None
        return "not published — no `links.production`, so no customer can respond"

    @property
    def dispatchable(self) -> bool:
        return self.blocker is None

    @property
    def measured(self) -> bool:
        return self.mrr is not None

    @property
    def later_stage(self) -> bool:
        return self.stage in LATER_STAGES

    @property
    def needs_decision(self) -> bool:
        """Measured at exactly zero past the point spend should show up."""
        return self.later_stage and self.mrr == 0


def count_ledger_entries(ledger_dir: Path = LEDGER_DIR) -> dict[str, int]:
    """Count ledger entries per venture name across portfolio/ledger/*.yaml.

    Counts only entries with a `venture:` field matching that venture's
    name directly. Entries recorded under `venture: portfolio` (a session
    surveying or fixing several ventures in one cycle) are not attributed
    to the individual ventures they mention in free-text outcomes -- doing
    that reliably would mean parsing prose, not structured data. So this
    undercounts ventures whose work happened inside a portfolio-wide
    survey entry; treat it as a lower bound, not a precise touch count.
    """
    counts: dict[str, int] = {}
    if not ledger_dir.is_dir():
        return counts
    for ledger_path in sorted(ledger_dir.glob("*.yaml")):
        data = yaml.safe_load(ledger_path.read_text()) or {}
        for entry in data.get("entries") or []:
            name = entry.get("venture")
            if name:
                counts[name] = counts.get(name, 0) + 1
    return counts


def count_portfolio_mentions(
    venture_names: list[str], ledger_dir: Path = LEDGER_DIR
) -> dict[str, int]:
    """Count `venture: portfolio` entries whose outcome text names each venture.

    `count_ledger_entries` only counts entries filed directly under a
    venture's own name, which as of 2026-08 is a small minority (~20%) of
    entries -- most sessions that touch several ventures in one pass record
    a single aggregated `venture: portfolio` entry instead, and those
    contribute nothing to the per-venture count. This recovers a heuristic
    signal from that majority: for each `venture: portfolio` entry, a
    venture is counted once if its exact slug appears as a whole word
    anywhere in that entry's `outcomes` text. Venture slugs
    (`ai-first-markets`, `retail-pilot-intel`, ...) are distinctive enough
    that false-positive substring matches are unlikely; this is still a
    heuristic, not a precise touch count, which is why it is reported
    separately from `ledger_entries` rather than merged into it.
    """
    counts: dict[str, int] = {name: 0 for name in venture_names}
    # Venture slugs are hyphenated (e.g. "ai-first-markets"), and a plain
    # \b boundary treats '-' as a non-word character -- it would match
    # "alpha-venture" inside "alpha-venture-extended" at the second hyphen.
    # Treat '-' as part of the "word" for boundary purposes instead, so a
    # slug only matches when it is not itself part of a longer slug.
    patterns = {
        name: re.compile(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])")
        for name in venture_names
    }
    if not ledger_dir.is_dir():
        return counts
    for ledger_path in sorted(ledger_dir.glob("*.yaml")):
        data = yaml.safe_load(ledger_path.read_text()) or {}
        for entry in data.get("entries") or []:
            if entry.get("venture") != "portfolio":
                continue
            text = "\n".join(str(o) for o in entry.get("outcomes") or [])
            for name, pattern in patterns.items():
                if pattern.search(text):
                    counts[name] += 1
    return counts


def load_merit_scores(scores_path: Path = SCORES_PATH) -> dict[str, float]:
    """Composite merit score per venture from portfolio/scoring/.

    Merit answers "is this business any good"; everything else in this file
    answers "can a session start on it". They are different questions and the
    scoring pass found they do not agree, so merit is used only to order
    ventures that are otherwise tied -- never to promote blocked work above
    work a session can actually pick up.
    """
    if not scores_path.is_file():
        return {}
    doc = yaml.safe_load(scores_path.read_text()) or {}
    return {
        v["slug"]: float(v["composite"])
        for v in doc.get("ventures") or []
        if v.get("slug") and v.get("composite") is not None
    }


def load_ventures(
    ventures_dir: Path = VENTURES_DIR,
    ledger_dir: Path = LEDGER_DIR,
    scores_path: Path = SCORES_PATH,
) -> list[Venture]:
    ledger_counts = count_ledger_entries(ledger_dir)
    merit_scores = load_merit_scores(scores_path)
    venture_dirs = sorted(p for p in ventures_dir.iterdir() if p.is_dir())
    names = []
    parsed = []
    for venture_dir in venture_dirs:
        if (venture_dir / "NOT-A-VENTURE").is_file():
            continue
        yaml_path = venture_dir / "VENTURE.yaml"
        if not yaml_path.is_file():
            continue
        data = yaml.safe_load(yaml_path.read_text()) or {}
        name = data.get("name", venture_dir.name)
        names.append(name)
        parsed.append((name, data))
    mention_counts = count_portfolio_mentions(names, ledger_dir)
    ventures = []
    for name, data in parsed:
        economics = data.get("economics") or {}
        budget = data.get("budget") or {}
        links = data.get("links") or {}
        ventures.append(
            Venture(
                name=name,
                stage=data.get("stage", "idea"),
                mrr=economics.get("mrr"),
                monthly_cost=economics.get("monthly_cost"),
                monthly_cap=float(budget.get("monthly_cap") or 0),
                protected=bool(budget.get("protected", False)),
                kill_criteria=data.get("kill_criteria") or [],
                hypotheses=data.get("hypotheses") or [],
                production_url=links.get("production"),
                ledger_entries=ledger_counts.get(name, 0),
                portfolio_mentions=mention_counts.get(name, 0),
                merit=merit_scores.get(name),
            )
        )
    return ventures


def rank(ventures: list[Venture]) -> list[Venture]:
    """Order ventures for the next unit of agent effort.

    Priority:
      1. Measured at $0 MRR at revenue stage or beyond -- this needs a
         decision (kill or fix) before more spend, not blind continuation.
      2. Work a session can actually start. A blocked venture ranked first
         hands every session an impossible task, which is how the queue
         came to be ignored: separate cycles kept concluding in the ledger
         that the top-ranked task was "outside what an unattended session
         can drive", each in prose, none of it reaching the router.
      3. Unmeasured ventures -- still owed their protected explore budget;
         null MRR is "not yet measured", not "measured and failing".
      4. Everything else: later stage before earlier stage, then by merit
         score descending, then monthly_cap descending, then name for a
         stable order.

    Merit (portfolio/scoring/) sits below dispatchability deliberately. The
    two orderings disagree -- the scoring pass measured the dispatchable
    ventures at a *lower* mean composite than the blocked ones -- so letting
    merit outrank dispatchability would put work no session can start back at
    the top of the queue, which is the failure `dispatchable` was added to
    fix. What merit does is order ventures that are otherwise tied, which
    before this was decided by budget cap: an input the portfolio set, not
    evidence about the venture.
    """

    def sort_key(v: Venture):
        return (
            0 if v.needs_decision else 1,
            0 if v.dispatchable else 1,
            0 if not v.measured else 1,
            0 if v.later_stage else 1,
            -(v.merit if v.merit is not None else 0.0),
            -v.monthly_cap,
            v.name,
        )

    return diversify(sorted(ventures, key=sort_key), tier=lambda v: sort_key(v)[:4])


# ---------------------------------------------------------------------------
# Families
#
# Measured 2026-10-16 (docs/reports/2026-10-16-calculator-glut.md): 121
# `*-bid-calculator` ventures are 9.6% of the portfolio but held 63 of the
# top 100 queue slots. Each one was scored on its own by the session that
# created it, 85 of them with an identical score vector, and nothing here
# could see that they were one product cloned per trade. So the queue told
# session after session to polish clone #37 instead of building the product
# the clones add up to.
#
# A family is ventures sharing a template suffix: `*-bid-calculator`,
# `*-fee-calculator`, `*-cost-calculator`. It is a crude key, on purpose: it
# needs no file reads, a reader can check it by eye, and it catches the shape
# that actually happened.
# ---------------------------------------------------------------------------

# Compound suffixes: the word before `-calculator` that names a template.
CALCULATOR_KINDS = frozenset(
    {"bid", "fee", "roi", "price", "cost", "rate", "payout", "margin", "profit", "tax"}
)
# A family this big is a product built many times, not a set of products.
FAMILY_MIN = 5
# The most members of one family allowed ahead of every other family's
# members within a tier. Later members still appear, after the rest of the tier.
FAMILY_CAP = 3


def family_of(name: str) -> str:
    """`<kind>-calculator` for the template families; otherwise the venture is
    its own family. A bare shared suffix (`-check`, `-keeper`, `-optimizer`)
    is not enough: those slugs name different products that happen to share
    a word, and telling a session to merge them would be wrong."""
    parts = name.split("-")
    if len(parts) >= 3 and parts[-1] == "calculator" and parts[-2] in CALCULATOR_KINDS:
        return f"{parts[-2]}-calculator"
    return name


def family_sizes(ventures: list[Venture]) -> dict[str, int]:
    sizes: dict[str, int] = {}
    for v in ventures:
        f = family_of(v.name)
        sizes[f] = sizes.get(f, 0) + 1
    return sizes


def diversify(ordered: list[Venture], tier=lambda v: 0, cap: int = FAMILY_CAP) -> list[Venture]:
    """Within each run of equal `tier`, let at most `cap` members of any large
    family keep their place; push the rest to the end of that tier, in order.

    Tiers (decision needed, dispatchable, measured, stage) are never crossed:
    this only reorders ventures `rank` already considers interchangeable on
    everything but merit, which is where the clones were winning.
    """
    sizes = family_sizes(ordered)
    out: list[Venture] = []
    i = 0
    while i < len(ordered):
        j = i
        while j < len(ordered) and tier(ordered[j]) == tier(ordered[i]):
            j += 1
        seen: dict[str, int] = {}
        kept, deferred = [], []
        for v in ordered[i:j]:
            f = family_of(v.name)
            if sizes[f] >= FAMILY_MIN:
                seen[f] = seen.get(f, 0) + 1
                if seen[f] > cap:
                    deferred.append(v)
                    continue
            kept.append(v)
        out.extend(kept + deferred)
        i = j
    return out


def consolidation_task(family: str, size: int) -> str:
    return (
        f"Consolidate: this is the top-ranked of {size} '*-{family}' ventures. Where they "
        "share one calculation shape, ship one product with a shared engine and the niches "
        "as data (every old URL kept, linked into it) instead of polishing a single copy; "
        "where they do not, say which members differ in the PR and deepen this one. "
        "See docs/reports/2026-10-16-calculator-glut.md."
    )


def next_task(v: Venture) -> str:
    if v.needs_decision:
        return "Review: measured at $0 MRR past revenue stage -- check against kill_criteria before further spend."
    if not v.measured:
        claim = v.untested_hypothesis
        if claim and v.blocker:
            return f'BLOCKED (unpublished) -- "{claim}"'
        if claim:
            return f'Explore: test the untested hypothesis -- "{claim}"'
        return "Explore: every recorded hypothesis is settled -- write the next one in VENTURE.yaml, then test it."
    if v.mrr is not None and v.monthly_cost is not None and v.mrr < v.monthly_cost:
        return "Review: monthly_cost exceeds mrr -- check against kill_criteria."
    return (
        "Continue: if this venture has no public URL, deploy the built surface "
        "(see portfolio/DIRECTION.md Current priority); otherwise advance the "
        "next documented roadmap task."
    )


def work_queue(ventures: list[Venture]) -> list[dict]:
    # The first member of each large family to appear gets the family's
    # consolidation task instead of its own; that is the one unit of work
    # that improves all of them.
    sizes = family_sizes(ventures)
    claimed: set[str] = set()

    def task_for(v: Venture) -> str:
        f = family_of(v.name)
        if sizes[f] >= FAMILY_MIN and f not in claimed and not v.needs_decision and v.dispatchable:
            claimed.add(f)
            return consolidation_task(f, sizes[f])
        return next_task(v)

    return [
        {
            "venture": v.name,
            "stage": v.stage,
            "protected": v.protected,
            "task": task_for(v),
            "dispatchable": v.dispatchable,
            "blocked_on": v.blocker,
            "spend_ceiling_usd": v.monthly_cap,
            "merit": v.merit,
            "ledger_entries_this_period": v.ledger_entries,
            "portfolio_mentions_this_period": v.portfolio_mentions,
        }
        for v in rank(ventures)
    ]


def decisions_by_merit(ventures: list[Venture]) -> list[dict]:
    """Group blocked ventures by the owner decision that would unblock them,
    ranked by the merit each decision would release.

    The router already records, per venture, *why* no session can start it
    (`Venture.blocker`) and *how good the business looks* (`merit`). What it
    did not do before was add those up the other way: for each owner-gated
    blocker, how much merit is waiting on it. The account-owner decision queue
    (issue #139) is ordered cheapest-first, which was right while nothing was
    known about what each ask releases; the #323 scoring pass then found the
    highest-merit venture sitting behind the ask ranked last for being the
    most expensive. This answers the question that ordering left open -- what
    does clearing each blocker actually release -- so cost and merit-unblocked
    can be read side by side rather than one without the other.

    Only blocked ventures contribute. `total_merit` sums the composites waiting
    on the decision; `top_venture` is the single highest-merit one it would
    release, because one 6.00 venture unblocked can matter more than three
    4.00s, and the sum alone hides that.
    """
    groups: dict[str, list[Venture]] = {}
    for v in ventures:
        if v.dispatchable or v.blocker is None:
            continue
        groups.setdefault(v.blocker, []).append(v)

    rows = []
    for blocker, blocked in groups.items():
        scored = [v for v in blocked if v.merit is not None]
        top = max(scored, key=lambda v: v.merit) if scored else None
        rows.append(
            {
                "decision": blocker,
                "blocked_ventures": len(blocked),
                "merit_scored": len(scored),
                "total_merit": round(sum(v.merit for v in scored), 3),
                "top_venture": top.name if top else None,
                "top_merit": top.merit if top else None,
                "ventures": sorted(v.name for v in blocked),
            }
        )
    rows.sort(
        key=lambda r: (-r["total_merit"], -(r["top_merit"] or 0.0), r["decision"])
    )
    return rows


def print_table(ventures: list[Venture], queue: list[dict]) -> None:
    later_cap = sum(v.monthly_cap for v in ventures if v.later_stage)
    early_cap = sum(v.monthly_cap for v in ventures if not v.later_stage)
    total_cap = later_cap + early_cap
    print(
        f"Total monthly caps: ${total_cap:.0f} "
        f"(later-stage ${later_cap:.0f}, early-stage ${early_cap:.0f})"
    )
    print(
        f"Target split per README.md: {EXPLORE_SPLIT_LATER:.0%} later-stage / "
        f"{EXPLORE_SPLIT_EARLY:.0%} early-stage"
    )
    ready = sum(1 for item in queue if item["dispatchable"])
    blocked = len(queue) - ready
    summary = f"Dispatchable now: {ready} of {len(queue)} ventures."
    if blocked:
        summary += (
            f" The other {blocked} need a customer response and are unpublished,"
            f" so no session can start them."
        )
    print(summary)
    scored = [item for item in queue if item["merit"] is not None]
    if scored:
        best = max(scored, key=lambda item: item["merit"])
        if not best["dispatchable"]:
            print(
                f"Highest merit ({best['merit']:.2f}, portfolio/scoring/) is "
                f"{best['venture']}, which is blocked. Merit and dispatchability "
                f"do not agree -- see portfolio/scoring/README.md."
            )
    print()
    print(
        f"{'#':<3}{'venture':<32}{'stage':<12}{'cap':>6}{'merit':>7}"
        f"{'ledger':>8}{'mentions':>10}  task"
    )
    for i, item in enumerate(queue, 1):
        merit = f"{item['merit']:.2f}" if item["merit"] is not None else "-"
        print(
            f"{i:<3}{item['venture']:<32}{item['stage']:<12}"
            f"{item['spend_ceiling_usd']:>6.0f}{merit:>7}"
            f"{item['ledger_entries_this_period']:>8}"
            f"{item['portfolio_mentions_this_period']:>10}  {item['task']}"
        )

    decisions = decisions_by_merit(ventures)
    if decisions:
        print()
        print(
            "Owner decisions ranked by merit unblocked "
            "(pair with cost in issue #139 / channel-inventory.md):"
        )
        print(f"{'merit':>7}{'top':>7}  {'ventures':<10}decision")
        for d in decisions:
            top = f"{d['top_merit']:.2f}" if d["top_merit"] is not None else "-"
            print(
                f"{d['total_merit']:>7.2f}{top:>7}  {d['blocked_ventures']:<10}"
                f"{d['decision']}"
            )
        print(
            "Merit-unblocked orders these; cost does not. The cheapest ask and "
            "the highest-merit one are not the same -- read this beside #139's "
            "cost ordering, not instead of it."
        )


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit the work queue as JSON instead of a table")
    parser.add_argument(
        "--decisions",
        action="store_true",
        help="emit the owner-decision / merit-unblocked rollup as JSON",
    )
    args = parser.parse_args(argv)

    ventures = load_ventures()
    if not ventures:
        print("No ventures with a VENTURE.yaml found.", file=sys.stderr)
        return 1

    if args.decisions:
        print(json.dumps(decisions_by_merit(ventures), indent=2))
        return 0

    queue = work_queue(ventures)

    if args.json:
        print(json.dumps(queue, indent=2))
    else:
        print_table(ventures, queue)
    return 0


if __name__ == "__main__":
    sys.exit(main())
