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
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"
LEDGER_DIR = REPO_ROOT / "portfolio" / "ledger"
SCORES_PATH = REPO_ROOT / "portfolio" / "scoring" / "venture-scores.yaml"
FLAGSHIPS_PATH = REPO_ROOT / "portfolio" / "flagships.yaml"

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
    # Commits in the last 7 days; filled by main() so rank() stays pure.
    recent_commits: int = 0
    # Set from VENTURE.yaml `consolidated_into: <host>` once this venture's
    # calculation lives in a shared engine; the family task skips it.
    consolidated_into: Optional[str] = None
    # Position in portfolio/flagships.yaml (0 = first) and its next deep
    # milestone; None for every venture not on that list.
    flagship_rank: Optional[int] = None
    flagship_next: Optional[str] = None

    @property
    def flagship(self) -> bool:
        return self.flagship_rank is not None

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
        # A flagship's task is a code milestone, which no customer has to answer.
        return self.flagship or self.blocker is None

    @property
    def awaits_visitors(self) -> bool:
        """The next hypothesis needs a response from visitors, and the venture is published.

        Code cannot settle it: the surface is built and live, so the next
        unit of work is distribution or measurement, not another feature.
        Run records (2026-10-19/20) say the top Explore rows kept sending
        sessions to products whose handoff was already shipped.
        """
        h = self._first_untested
        return bool(h and h.get("evidence") == "customer-contact" and self.production_url)

    @property
    def maintain_only(self) -> bool:
        """A calculator that is not a flagship: kept live and fixed when broken,
        never deepened (owner, 2026-10-21)."""
        return not self.flagship and is_calculator(self.name)

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
        data = _load_yaml(ledger_path)
        for entry in data.get("entries") or []:
            name = entry.get("venture")
            if name:
                counts[name] = counts.get(name, 0) + 1
    return counts


_WARNED_NO_LIBYAML = False


def _load_yaml(path: Path) -> dict:
    """safe_load, through libyaml when installed (the pure-Python parser was 35s of a 60s run)."""
    loader = getattr(yaml, "CSafeLoader", None)
    if loader is None:
        global _WARNED_NO_LIBYAML
        if not _WARNED_NO_LIBYAML:
            _WARNED_NO_LIBYAML = True
            print("(this python's PyYAML has no libyaml: loading ~1,300 VENTURE.yaml takes ~35s. "
                  "Another interpreter is ~15x faster, e.g. /usr/bin/python3.13 or a venv with "
                  "`pip install pyyaml`.)", file=sys.stderr)
        loader = yaml.SafeLoader
    return yaml.load(path.read_text(), Loader=loader) or {}


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
    # A slug counts when it equals a whole run of [\w-] characters in the text, which is the same
    # test as the boundary lookarounds. One tokenise per entry replaces ~1,300 regex scans per
    # entry (46s of a 60s run on 2026-10-19).
    plain = {name for name in venture_names if re.fullmatch(r"[\w-]+", name)}
    patterns = {
        name: re.compile(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])")
        for name in venture_names if name not in plain
    }
    if not ledger_dir.is_dir():
        return counts
    for ledger_path in sorted(ledger_dir.glob("*.yaml")):
        data = _load_yaml(ledger_path)
        for entry in data.get("entries") or []:
            if entry.get("venture") != "portfolio":
                continue
            text = "\n".join(str(o) for o in entry.get("outcomes") or [])
            for name in plain.intersection(re.findall(r"[\w-]+", text)):
                counts[name] += 1
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
    doc = _load_yaml(scores_path)
    return {
        v["slug"]: float(v["composite"])
        for v in doc.get("ventures") or []
        if v.get("slug") and v.get("composite") is not None
    }


def load_flagships(path: Path = FLAGSHIPS_PATH) -> dict[str, tuple[int, str]]:
    """{venture: (rank, next milestone)} from portfolio/flagships.yaml.

    The flagships are the few ventures with real depth that most venture runs
    should deepen instead of adding another small tool (owner, 2026-10-20;
    see that file). A missing file means no flagships, not an error.
    """
    if not path.is_file():
        return {}
    out: dict[str, tuple[int, str]] = {}
    for i, entry in enumerate(_load_yaml(path).get("flagships") or []):
        if isinstance(entry, dict) and entry.get("venture"):
            out[entry["venture"]] = (i, str(entry.get("next") or "").strip())
    return out


def load_ventures(
    ventures_dir: Path = VENTURES_DIR,
    ledger_dir: Path = LEDGER_DIR,
    scores_path: Path = SCORES_PATH,
    flagships_path: Path = FLAGSHIPS_PATH,
) -> list[Venture]:
    ledger_counts = count_ledger_entries(ledger_dir)
    merit_scores = load_merit_scores(scores_path)
    flagships = load_flagships(flagships_path)
    venture_dirs = sorted(p for p in ventures_dir.iterdir() if p.is_dir())
    names = []
    parsed = []
    for venture_dir in venture_dirs:
        if (venture_dir / "NOT-A-VENTURE").is_file():
            continue
        yaml_path = venture_dir / "VENTURE.yaml"
        if not yaml_path.is_file():
            continue
        data = _load_yaml(yaml_path)
        name = data.get("name", venture_dir.name)
        names.append(name)
        parsed.append((name, data))
    mention_counts = count_portfolio_mentions(names, ledger_dir)
    ventures = []
    for name, data in parsed:
        economics = data.get("economics") or {}
        budget = data.get("budget") or {}
        links = data.get("links") or {}
        flag_rank, flag_next = flagships.get(name, (None, None))
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
                consolidated_into=data.get("consolidated_into"),
                flagship_rank=flag_rank,
                flagship_next=flag_next,
            )
        )
    return ventures


# A venture with this many commits in 7 days is usually already deep; its
# Explore task needs visitors more than code, so it yields to a shallow one
# (5+ run-record doc_friction reports, 2026-10-18/19: "top rows all saturated").
HOT_COMMITS = 3


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
      3. Flagships (portfolio/flagships.yaml), in that file's order. These
         are the ventures with real depth; the owner asked (2026-10-20) for
         more of the work to deepen them rather than add small tools. They
         are exempt from the HOT_COMMITS demotion below, which exists to
         spread effort across shallow ventures, the opposite of what a
         flagship needs.
      4. Not a calculator. Calculators are maintain-only (owner, 2026-10-21,
         `prompts/goals.md` "Direction: depth over calculators"), so they
         sink below every other dispatchable venture and their task says
         fix-if-broken rather than explore or consolidate.
      5. Unmeasured ventures -- still owed their protected explore budget;
         null MRR is "not yet measured", not "measured and failing". Among
         them, ventures with an untested hypothesis come before ones with none:
         "write a hypothesis" is a thin task, and dozens of them at the top
         hid the ventures that had a real claim to test.
      6. Everything else: later stage before earlier stage, then ventures not
         already folded into another (consolidated_into) before those that
         were (their Explore task has no product left to test), then ventures not
         worked heavily this week (HOT_COMMITS+ commits in 7 days) before
         those that were, then by merit score descending, then monthly_cap descending, then least-worked (ledger + mentions), then name for a
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
            v.flagship_rank if v.flagship_rank is not None else 1_000_000,
            1 if v.maintain_only else 0,
            1 if v.awaits_visitors else 0,
            0 if not v.measured else 1,
            0 if v.untested_hypothesis else 1,
            0 if v.later_stage else 1,
            1 if v.consolidated_into else 0,
            1 if v.recent_commits >= HOT_COMMITS else 0,
            -(v.merit if v.merit is not None else 0.0),
            -v.monthly_cap,
            v.ledger_entries + v.portfolio_mentions,
            v.name,
        )

    return sorted(ventures, key=sort_key)


# ---------------------------------------------------------------------------
# Calculators
#
# Measured 2026-10-16 (docs/reports/2026-10-16-calculator-glut.md): 121
# `*-bid-calculator` ventures held 63 of the top 100 queue slots, so the queue
# told session after session to polish clone #37. The fix then was to cap each
# template family and hand its top member a "Consolidate" task. The owner,
# 2026-10-21, went further: drop the work that keeps runs on calculators at
# all. So a calculator that is not a flagship sinks below every other
# dispatchable venture and is offered only maintenance.
# ---------------------------------------------------------------------------

def is_calculator(name: str) -> bool:
    """A calculator by its slug: the last word is `calculator` or `estimator`.
    Crude on purpose, like `family_of`: a reader can check it by eye."""
    return name.rsplit("-", 1)[-1] in ("calculator", "estimator")


MAINTAIN_TASK = (
    "Maintain only (owner, 2026-10-21): this is a calculator. Fix it if it is broken "
    "(a failing test, a wrong result, a dead link); otherwise add no features, pages, "
    "comparison pages or consolidation work -- take a flagship or research task instead."
)


NO_HYPOTHESIS_PREFIX = "Explore: no hypothesis recorded"
NO_HYPOTHESIS_ROWS = 3
FLAGSHIP_NEXT_CHARS = 500


def next_task(v: Venture) -> str:
    if v.needs_decision:
        return "Review: measured at $0 MRR past revenue stage -- check against kill_criteria before further spend."
    if v.maintain_only:
        return MAINTAIN_TASK
    if v.flagship:
        milestone = v.flagship_next or "the venture's own roadmap"
        if len(milestone) > FLAGSHIP_NEXT_CHARS:
            # The full history is in flagships.yaml; the queue prints the head.
            milestone = milestone[:FLAGSHIP_NEXT_CHARS].rstrip() + " ... (full `next:` in portfolio/flagships.yaml)"
        return (
            f"Deepen (flagship {v.flagship_rank + 1}): {milestone} "
            "Land a working slice, then rewrite this venture's `next:` in portfolio/flagships.yaml."
        )
    if not v.measured:
        claim = v.untested_hypothesis
        if claim and v.blocker:
            return f'BLOCKED (unpublished) -- "{claim}"'
        if claim and v.awaits_visitors:
            return (
                f'Explore (awaiting visitors; needs distribution or a usage reading, not more features): "{claim}"'
            )
        if claim:
            return f'Explore: test the untested hypothesis -- "{claim}"'
        if not v.hypotheses:
            return (
                f"{NO_HYPOTHESIS_PREFIX} -- add a `hypotheses:` list to VENTURE.yaml "
                "(`- claim: ...`, `status: untested`; see 1099-k-threshold-checker), then test it."
            )
        return "Explore: every recorded hypothesis is settled -- write the next one in VENTURE.yaml, then test it."
    if v.mrr is not None and v.monthly_cost is not None and v.mrr < v.monthly_cost:
        return "Review: monthly_cost exceeds mrr -- check against kill_criteria."
    return (
        "Continue: if this venture has no public URL, deploy the built surface "
        "(see portfolio/hosting/README.md); otherwise advance the "
        "next documented roadmap task."
    )


def work_queue(ventures: list[Venture]) -> list[dict]:
    return [
        {
            "venture": v.name,
            "stage": v.stage,
            "protected": v.protected,
            "flagship": v.flagship,
            "task": next_task(v),
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


# The whole run must fit a 120s foreground tool call (run-record doc_friction, 2026-10-19: the
# 120s fetch alone pushed allocate.py into the background with empty output).
FETCH_TIMEOUT_S = 50


def _history_reaches(cutoff: datetime, cwd: Path) -> bool:
    """True when origin/main's oldest reachable commit is already near `cutoff`, so a fetch adds
    nothing. --shallow-since leaves the clone shallow, so without this every run refetched
    (3 min on 2026-10-19)."""
    out = subprocess.run(["git", "log", "origin/main", "--format=%ct"], capture_output=True, text=True,
                         timeout=20, cwd=cwd).stdout.split()
    return bool(out) and int(out[-1]) <= cutoff.timestamp() + 2 * 86400


def deepen_to_window(days: int) -> bool:
    """In a shallow clone, fetch main back `days` days so commit counts mean something."""
    try:
        shallow = subprocess.run(
            ["git", "rev-parse", "--is-shallow-repository"],
            capture_output=True, text=True, timeout=30, cwd=Path(__file__).resolve().parent,
        ).stdout.strip() == "true"
        if not shallow:
            return False
        cutoff = datetime.now(timezone.utc) - timedelta(days=days + 1)
        if _history_reaches(cutoff, Path(__file__).resolve().parent):
            return False
        since = cutoff.strftime("%Y-%m-%d")
        print(f"(shallow clone: fetching main since {since} for 7-day commit counts)", file=sys.stderr)
        return subprocess.run(
            ["git", "fetch", "-q", f"--shallow-since={since}", "origin", "main"],
            capture_output=True, timeout=FETCH_TIMEOUT_S, cwd=Path(__file__).resolve().parent,
        ).returncode == 0
    except subprocess.TimeoutExpired:
        # Runs reported 10+ minutes of silence here (2026-10-19); rank on what is local instead.
        print(f"(fetch exceeded {FETCH_TIMEOUT_S}s; 7-day commit counts are partial. "
              "Run `git fetch --unshallow origin main` in the background for full ones.)", file=sys.stderr)
        return False
    except (OSError, subprocess.SubprocessError):
        return False


def recent_commits(days: int = 7, deepen: bool = True) -> dict[str, int]:
    """Commits in the last `days` days touching each ventures/<slug>/.

    Display-only: a venture with many recent commits is usually already deep,
    and its Explore task needs visitors more than code (run-record doc_friction,
    2026-10-18/19). Empty when git history is unavailable.

    A shallow clone (every cloud session) holds a few hours of history, so
    every count came out 1-2 and nothing was ever demoted; deepen it to the
    window first (about a minute, far cheaper than --unshallow)."""
    if deepen:
        deepen_to_window(days)
    try:
        out = subprocess.run(
            ["git", "log", f"--since={days}.days", "--name-only", "--format=%x00"],
            capture_output=True, text=True, timeout=30, cwd=Path(__file__).resolve().parent,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    counts: dict[str, int] = {}
    for commit in out.split("\0"):
        slugs = {
            parts[1] for line in commit.splitlines()
            if len(parts := line.split("/", 2)) > 2 and parts[0] == "ventures"
        }
        for slug in slugs:
            counts[slug] = counts.get(slug, 0) + 1
    return counts


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
    flagships = [item["venture"] for item in queue if item["flagship"]]
    if flagships:
        print(
            f"Flagships ({len(flagships)}, portfolio/flagships.yaml): deepen these before "
            "adding another small tool -- owner, 2026-10-20."
        )
    print()
    print(
        f"{'#':<3}{'venture':<32}{'stage':<12}{'cap':>6}{'merit':>7}"
        f"{'ledger':>8}{'mentions':>10}{'7d-commits':>12}  task"
    )
    recent = recent_commits()
    empty_shown = 0
    empty_hidden = 0
    for i, item in enumerate(queue, 1):
        if item["task"].startswith(NO_HYPOTHESIS_PREFIX):
            empty_shown += 1
            if empty_shown > NO_HYPOTHESIS_ROWS:
                empty_hidden += 1
                continue
        merit = f"{item['merit']:.2f}" if item["merit"] is not None else "-"
        print(
            f"{i:<3}{item['venture']:<32}{item['stage']:<12}"
            f"{item['spend_ceiling_usd']:>6.0f}{merit:>7}"
            f"{item['ledger_entries_this_period']:>8}"
            f"{item['portfolio_mentions_this_period']:>10}"
            f"{recent.get(item['venture'], 0):>12}  {item['task']}"
        )
    if empty_hidden:
        print(
            f"... and {empty_hidden} more ventures with no hypothesis recorded "
            f"(identical task; `--json` lists them all)."
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
    parser.add_argument("--no-deepen", action="store_true",
                        help="skip the shallow-clone fetch; 7-day commit counts may be partial")
    args = parser.parse_args(argv)

    ventures = load_ventures()
    if not ventures:
        print("No ventures with a VENTURE.yaml found.", file=sys.stderr)
        return 1

    if args.decisions:
        print(json.dumps(decisions_by_merit(ventures), indent=2))
        return 0

    recent = recent_commits(deepen=not args.no_deepen)
    for v in ventures:
        v.recent_commits = recent.get(v.name, 0)
    queue = work_queue(ventures)

    if args.json:
        print(json.dumps(queue, indent=2))
    else:
        print_table(ventures, queue)
    return 0


def _reexec_with_libyaml() -> None:
    """Re-run this script under an interpreter whose PyYAML has libyaml (35s -> ~2s).

    Only when run as a script and the current PyYAML lacks libyaml; one hop
    (ALLOCATE_REEXEC) so a bad candidate cannot loop. Silent if none is found.
    """
    if getattr(yaml, "CSafeLoader", None) or os.environ.get("ALLOCATE_REEXEC"):
        return
    probe = "import yaml,sys; sys.exit(0 if getattr(yaml,'CSafeLoader',None) else 1)"
    for cand in ("/usr/bin/python3.13", "/usr/bin/python3.12", "/usr/bin/python3"):
        if cand != sys.executable and os.path.exists(cand) and \
                subprocess.run([cand, "-I", "-c", probe], capture_output=True).returncode == 0:
            os.environ["ALLOCATE_REEXEC"] = "1"
            os.execv(cand, [cand, *sys.argv])


if __name__ == "__main__":
    _reexec_with_libyaml()
    sys.exit(main())
