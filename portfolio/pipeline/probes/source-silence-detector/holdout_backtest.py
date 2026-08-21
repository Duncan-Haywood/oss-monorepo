#!/usr/bin/env python3
"""Score the silence detector's anchor choice on held-out sources, not on the two events that chose it.

[`README.md`](README.md) closes with the limit this script exists to remove:

> **`p99` is selected on the same two events it is scored on.** With one quiet
> source detected, the quantile sweep is a demonstration that the anchor matters
> and roughly where the knee sits, not a tuned parameter with a held-out
> validation. Re-derive it on the next mirrored register that dies.

Waiting for the next register to die is a plan with no date on it. The nine
mirrors' full commit history — already fetched and committed by
[`fetch_prior_history.py`](fetch_prior_history.py) — contains dormancy episodes
that already happened: stretches where a source published nothing for months and
a monitor watching it should have said so. `detect_silence.py` cannot see them
because it scores only the 180-day window, where a source is either quiet at the
end or it is not, and exactly two were.

This script scores the same detector over **every** historical gap instead, and
selects the anchor by leave-one-source-out cross-validation, so the quantile a
fold recommends is never scored on a source that helped choose it.

What is deliberately the same as `detect_silence.py`:

- the threshold rule (`max(floor, ceil(anchor_gap * multiplier))`), the anchor
  options (`max`, nearest-rank `quantile`), and the defaults;
- no lookahead in the detector — on any day it sees only changes at or before
  that day, and its threshold is fitted only on gaps that had already closed;
- read-only, standard library only, no network, no credentials, publishes
  nothing.

What is deliberately different:

- **Labels use hindsight; the detector never does.** A gap is a dormancy episode
  if it ran at least `--dormancy-days`. Knowing how long a gap turned out to be
  is a fact about the past that a scorer is allowed and a monitor is not.
- **Scoring is per episode, not per window.** Recall is over episodes, latency is
  measured from each episode's last change, and nuisance is alarm-days that fell
  in gaps too short to be episodes.

Usage:
    python3 holdout_backtest.py
    python3 holdout_backtest.py --dormancy-days 90
    python3 holdout_backtest.py --json results-holdout-YYYY-MM-DD.json

Offline tests: python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

from detect_silence import (
    DEFAULT_FLOOR_DAYS,
    DEFAULT_MIN_GAPS,
    DEFAULT_MULTIPLIER,
    DEFAULT_WARMUP_DAYS,
    Config,
    cadence_threshold,
)

HERE = Path(__file__).resolve().parent
DEFAULT_PRIOR = HERE / "prior-history-2026-08-21.json"

# A gap this long or longer is treated as the source having gone quiet. 120 days
# is four months of publishing nothing, which is silence by any reading of the
# product claim ("alert on pipeline silence, not just on findings"), and it is
# set without reference to any source's own distribution so that the label
# cannot be tuned by the same statistic the detector is fitted on. Swept in
# `--sweep-dormancy` because a threshold nobody can check is a threshold nobody
# should trust.
DEFAULT_DORMANCY_DAYS = 120

# Anchors compared. `max` at multiplier 1.5 is the rule `register-change-rate`
# specified; the quantiles are the alternative the 2026-08-21 amendment found it
# needed. 1.0 reproduces `max` exactly and is kept in the sweep as a control:
# if the two rows ever disagree, the sweep is wrong, not the finding.
ANCHOR_GRID: list[tuple[str, float | None]] = [
    ("max", None),
    ("quantile", 0.50),
    ("quantile", 0.75),
    ("quantile", 0.90),
    ("quantile", 0.95),
    ("quantile", 0.99),
    ("quantile", 1.00),
]

DORMANCY_GRID = [60, 90, 120, 180, 365]

# Nuisance budgets, in alarm-days per source-year, that the anchor is selected
# under. There is no such thing as "the best anchor" here — recall and nuisance
# trade against each other monotonically, so an unconstrained objective just
# picks the loudest setting. The budget is the product decision; the
# cross-validation's job is to say what recall that decision buys on a source it
# has not seen. 5/yr is roughly "one alarm-day a quarter"; 50/yr is a detector
# shouting for over a month of every year, kept in the grid to show what the
# unconstrained objective was quietly choosing.
BUDGET_GRID = [2.0, 5.0, 10.0, 20.0, 50.0]
DEFAULT_BUDGET = 5.0


def _selection_key(row: dict, budget: float) -> tuple:
    """Rank anchors for a fold: most episodes detected *within the nuisance budget*.

    Anchors over budget are not merely penalised, they are ranked behind every
    anchor that fits — a monitor nobody leaves switched on has no recall. Among
    those over budget the quietest wins, so a fold where nothing fits still
    returns the least-bad answer rather than an arbitrary one.

    Stated here rather than buried in a sort key because the objective is the
    part of a cross-validation that can silently launder a preference into a
    "measured" result. The first version of this file maximised detections with
    nuisance only as a tie-break, and duly selected an anchor costing 43
    nuisance alarm-days per source-year — see the README amendment.
    """
    rate = row["nuisance_days_per_source_year"] or 0.0
    over = rate > budget
    return (
        over,
        rate if over else -row["episodes_detected"],
        row["median_latency_days"] if row["median_latency_days"] is not None else 10**9,
        rate,
    )


def anchor_label(anchor: str, quantile: float | None) -> str:
    return anchor if quantile is None else f"{anchor}:{quantile:g}"


def config_for(anchor: str, quantile: float | None, base: Config) -> Config:
    return Config(
        multiplier=base.multiplier,
        floor_days=base.floor_days,
        min_gaps=base.min_gaps,
        warmup_days=base.warmup_days,
        anchor=anchor,
        quantile=1.0 if quantile is None else quantile,
    )


# ---------------------------------------------------------------------------
# Replay
# ---------------------------------------------------------------------------


def replay_source(days: list[date], end: date, cfg: Config) -> list[dict]:
    """One record per gap in this source's history, with what the detector did in it.

    The detector's threshold changes only when a new change day arrives, so each
    gap is a segment of constant threshold and the alarm days inside it are a
    closed form rather than a day loop: the first alarm falls
    `threshold + 1` days after the last change, and every day from there to the
    end of the gap is an alarm day. That is the same alarm condition
    `detect_silence.evaluate_source` applies day by day — see
    `test_holdout_backtest.py`, which asserts the two agree on the probe's own
    window rather than asking the reader to take it on trust.

    The trailing gap — last change to `end` — is included, because a source that
    is quiet right now is the case the product exists for.
    """
    if not days:
        return []

    start = days[0]
    warmup_end = start + timedelta(days=cfg.warmup_days)
    sorted_gaps: list[int] = []
    records: list[dict] = []

    for i, last_change in enumerate(days):
        following = days[i + 1] if i + 1 < len(days) else None
        # Gap end is the day before the next change; for the open trailing gap it
        # is the last day of observed history.
        gap_end = (following - timedelta(days=1)) if following is not None else end
        gap_len = ((following - last_change).days if following is not None
                   else (end - last_change).days)

        threshold = cadence_threshold(sorted_gaps, cfg)
        record = {
            "last_change": last_change.isoformat(),
            "gap_days": gap_len,
            "open": following is None,
            "threshold": threshold,
            "calibrated": threshold is not None,
            # How much history the detector had been fitted on when this gap
            # opened. Carried so the monotone-stretching claim about `max` can be
            # tested against episode age instead of asserted.
            "prior_history_days": (last_change - start).days,
            "prior_gaps": len(sorted_gaps),
            "alarm_days": 0,
            "first_alarm": None,
            "latency_days": None,
        }

        if threshold is not None and gap_len > 0:
            first_alarm = last_change + timedelta(days=threshold + 1)
            alarm_start = max(first_alarm, warmup_end)
            if alarm_start <= gap_end:
                record["alarm_days"] = (gap_end - alarm_start).days + 1
                record["first_alarm"] = alarm_start.isoformat()
                record["latency_days"] = (alarm_start - last_change).days

        # A gap is only an exam question if the detector was allowed to answer:
        # calibrated, and with at least one day of the gap outside warm-up.
        record["evaluable"] = bool(
            threshold is not None and gap_len > 0 and gap_end >= warmup_end
        )
        records.append(record)

        if following is not None:
            bisect.insort(sorted_gaps, gap_len)

    return records


def score_source(records: list[dict], dormancy_days: int) -> dict:
    """Split one source's gap records into episodes, misses, and nuisance."""
    episodes = [r for r in records if r["gap_days"] >= dormancy_days]
    evaluable = [r for r in episodes if r["evaluable"]]
    detected = [r for r in evaluable if r["alarm_days"] > 0]
    latencies = [r["latency_days"] for r in detected]

    short = [r for r in records if r["gap_days"] < dormancy_days]
    nuisance_days = sum(r["alarm_days"] for r in short)
    nuisance_episodes = sum(1 for r in short if r["alarm_days"] > 0)

    observed = _observed_days(records)
    return {
        "episodes": len(episodes),
        "episodes_evaluable": len(evaluable),
        "episodes_skipped_uncalibrated": len(episodes) - len(evaluable),
        "episodes_detected": len(detected),
        "recall": round(len(detected) / len(evaluable), 3) if evaluable else None,
        "median_latency_days": statistics.median(latencies) if latencies else None,
        "max_latency_days": max(latencies) if latencies else None,
        "nuisance_alarm_days": nuisance_days,
        "nuisance_alarm_episodes": nuisance_episodes,
        "observed_days": observed,
        "nuisance_days_per_year": round(nuisance_days * 365.25 / observed, 2) if observed else None,
        "misses": [
            {"last_change": r["last_change"], "gap_days": r["gap_days"], "threshold": r["threshold"]}
            for r in evaluable
            if r["alarm_days"] == 0
        ],
    }


def _observed_days(records: list[dict]) -> int:
    if not records:
        return 0
    first = date.fromisoformat(records[0]["last_change"])
    last = date.fromisoformat(records[-1]["last_change"])
    return (last - first).days + records[-1]["gap_days"]


def aggregate(per_source: dict[str, dict]) -> dict:
    """Pool source scores. Recall is over episodes, not the mean of per-source recalls.

    A mean of rates would weight `github/advisory-database` — which has never had
    a dormancy episode — the same as `FDA/openfda`, which is most of the sample.
    """
    evaluable = sum(s["episodes_evaluable"] for s in per_source.values())
    detected = sum(s["episodes_detected"] for s in per_source.values())
    latencies = [
        s["median_latency_days"] for s in per_source.values() if s["median_latency_days"] is not None
    ]
    observed = sum(s["observed_days"] for s in per_source.values())
    nuisance = sum(s["nuisance_alarm_days"] for s in per_source.values())
    return {
        "sources": len(per_source),
        "episodes_evaluable": evaluable,
        "episodes_detected": detected,
        "episodes_skipped_uncalibrated": sum(
            s["episodes_skipped_uncalibrated"] for s in per_source.values()
        ),
        "recall": round(detected / evaluable, 3) if evaluable else None,
        "median_latency_days": statistics.median(latencies) if latencies else None,
        "nuisance_alarm_days": nuisance,
        "nuisance_alarm_episodes": sum(
            s["nuisance_alarm_episodes"] for s in per_source.values()
        ),
        "observed_source_days": observed,
        "nuisance_days_per_source_year": round(nuisance * 365.25 / observed, 2) if observed else None,
    }


def sweep(
    history: dict[str, list[date]], end: date, base: Config, dormancy_days: int
) -> list[dict]:
    """Every anchor scored on every source, in sample. This is the table the
    README's limit is about: it is where `p99` was chosen and also where it was
    scored."""
    rows = []
    for anchor, quantile in ANCHOR_GRID:
        cfg = config_for(anchor, quantile, base)
        per_source = {
            repo: score_source(replay_source(days, end, cfg), dormancy_days)
            for repo, days in history.items()
        }
        row = {"anchor": anchor_label(anchor, quantile)}
        row.update(aggregate(per_source))
        row["per_source"] = per_source
        rows.append(row)
    return rows


def score_all_anchors(
    history: dict[str, list[date]], end: date, base: Config, dormancy_days: int
) -> dict[str, dict[str, dict]]:
    """anchor label -> source -> score. Computed once and reused by every fold."""
    scored: dict[str, dict[str, dict]] = {}
    for anchor, quantile in ANCHOR_GRID:
        label = anchor_label(anchor, quantile)
        cfg = config_for(anchor, quantile, base)
        scored[label] = {
            repo: score_source(replay_source(days, end, cfg), dormancy_days)
            for repo, days in history.items()
        }
    return scored


def leave_one_source_out(
    history: dict[str, list[date]],
    end: date,
    base: Config,
    dormancy_days: int,
    budget: float = DEFAULT_BUDGET,
    scored: dict[str, dict[str, dict]] | None = None,
) -> dict:
    """Select the anchor on 8 sources, score it on the 9th, nine times over.

    This is the whole point of the file. The in-sample sweep can only ever say
    "the anchor that fits these events fits these events"; a fold's held-out
    source contributed nothing to the choice made for it.
    """
    scored = scored or score_all_anchors(history, end, base, dormancy_days)

    folds = []
    for held_out in sorted(history):
        train_rows = []
        for label, by_source in scored.items():
            train = {r: s for r, s in by_source.items() if r != held_out}
            row = {"anchor": label}
            row.update(aggregate(train))
            train_rows.append(row)
        best = min(train_rows, key=lambda r: _selection_key(r, budget))
        test = scored[best["anchor"]][held_out]
        folds.append(
            {
                "held_out": held_out,
                "selected_anchor": best["anchor"],
                "train_recall": best["recall"],
                "train_episodes_evaluable": best["episodes_evaluable"],
                "test": {
                    "episodes_evaluable": test["episodes_evaluable"],
                    "episodes_detected": test["episodes_detected"],
                    "recall": test["recall"],
                    "median_latency_days": test["median_latency_days"],
                    "nuisance_alarm_days": test["nuisance_alarm_days"],
                    "nuisance_days_per_year": test["nuisance_days_per_year"],
                    "misses": test["misses"],
                },
            }
        )

    held_out_scores = {f["held_out"]: scored[f["selected_anchor"]][f["held_out"]] for f in folds}
    selected = sorted({f["selected_anchor"] for f in folds})
    return {
        "objective": (
            f"maximise episodes detected on the 8 training sources subject to "
            f"nuisance <= {budget} alarm-days per source-year; ties to lowest median latency"
        ),
        "budget_days_per_source_year": budget,
        "folds": folds,
        "anchors_selected": selected,
        "unanimous": len(selected) == 1,
        "held_out_pooled": aggregate(held_out_scores),
    }


# Buckets of "how much history had the detector been fitted on when this episode
# opened", used to test the mechanism claim rather than assert it.
AGE_BUCKETS = [(0, 365, "<1y"), (365, 1095, "1-3y"), (1095, 2190, "3-6y"), (2190, 10**9, ">=6y")]


def anchor_decay(
    history: dict[str, list[date]], end: date, base: Config, dormancy_days: int
) -> list[dict]:
    """Detection rate by how much history the threshold had already absorbed.

    The 2026-08-21 amendment argued that `max` fails because it is *monotone in
    history length* — every long gap a source survives permanently raises its own
    alarm threshold — and conceded the argument was "checkable by inspection"
    rather than measured. It is measurable: if the mechanism is real, `max`
    should detect episodes that arrive early in a source's life and miss the ones
    that arrive late, while a quantile anchor should be roughly flat. A quantile
    is not monotone, so it has no reason to decay.
    """
    rows = []
    for anchor, quantile in ANCHOR_GRID:
        cfg = config_for(anchor, quantile, base)
        buckets = {name: [0, 0] for _, _, name in AGE_BUCKETS}
        for days in history.values():
            for record in replay_source(days, end, cfg):
                if not record["evaluable"] or record["gap_days"] < dormancy_days:
                    continue
                age = record["prior_history_days"]
                for lo, hi, name in AGE_BUCKETS:
                    if lo <= age < hi:
                        buckets[name][1] += 1
                        if record["alarm_days"] > 0:
                            buckets[name][0] += 1
                        break
        rows.append(
            {
                "anchor": anchor_label(anchor, quantile),
                "by_age": {
                    name: {
                        "detected": d,
                        "episodes": n,
                        "recall": round(d / n, 3) if n else None,
                    }
                    for name, (d, n) in buckets.items()
                },
            }
        )
    return rows


def _degeneracy_bound(quantile: float, limit: int = 100_000) -> int:
    """Fewest closed gaps at which the quantile anchor stops being the maximum.

    In exact arithmetic this is `ceil(q * n) < n` first holding at
    `n = 1 / (1 - q)`, so `q = 0.99` needs 100 gaps. It is measured by asking
    `anchor_gap`'s own `ceil` rather than evaluating that formula, because the
    formula does not survive binary floating point: `1 / (1 - 0.9)` evaluates to
    `10.000000000000002`, so `math.ceil` of it returns 11 and reports a bound one
    gap too high. The detector itself is fine — `0.9 * 10` is exactly `9.0` — and
    a bound that describes the detector is the only kind worth reporting. Pinned
    in `test_holdout_backtest.py` so a later reader who re-derives it from the
    formula and gets 11 knows which of the two moved.
    """
    for n in range(1, limit + 1):
        if min(n, max(1, math.ceil(quantile * n))) != n:
            return n
    return limit


def quantile_degeneracy(
    history: dict[str, list[date]], end: date, base: Config, dormancy_days: int, quantile: float
) -> dict:
    """Where does the quantile anchor collapse back into the `max` anchor?

    `anchor_gap` uses nearest rank: `ordered[ceil(q * n) - 1]`. That index is the
    last element — the maximum — whenever `ceil(q * n) == n`, which is every `n`
    below `1 / (1 - q)`. At the recommended `q = 0.99` that is **every source
    with fewer than 100 closed gaps**.

    This matters because gap count is not a nuisance parameter here, it is
    inversely related to how likely a source is to be the kind that goes dark. A
    register that publishes daily accumulates thousands of gaps and gets a real
    quantile; a register that publishes a few times a year accumulates dozens and
    silently gets `max` — the anchor the amendment adopted `quantile` to escape.
    """
    rows = {}
    needed = _degeneracy_bound(quantile)
    cfg_q = config_for("quantile", quantile, base)
    cfg_max = config_for("max", None, base)
    for repo, days in sorted(history.items()):
        gaps = sorted((b - a).days for a, b in zip(days, days[1:]))
        n = len(gaps)
        rank = min(n, max(1, math.ceil(quantile * n))) if n else 0
        score_q = score_source(replay_source(days, end, cfg_q), dormancy_days)
        score_max = score_source(replay_source(days, end, cfg_max), dormancy_days)
        rows[repo] = {
            "closed_gaps": n,
            "nearest_rank": rank,
            "degenerate": bool(n and rank == n),
            "anchor_gap_days": gaps[rank - 1] if n else None,
            "max_gap_days": gaps[-1] if n else None,
            "final_threshold_quantile": cadence_threshold(gaps, cfg_q),
            "final_threshold_max": cadence_threshold(gaps, cfg_max),
            "dormancy_episodes": score_q["episodes_evaluable"],
            "detected_quantile": score_q["episodes_detected"],
            "detected_max": score_max["episodes_detected"],
        }
    degenerate = [r for r, v in rows.items() if v["degenerate"]]
    return {
        "quantile": quantile,
        "gaps_needed_for_a_non_degenerate_anchor": needed,
        "degenerate_sources": degenerate,
        "episodes_on_degenerate_sources": sum(
            v["dormancy_episodes"] for r, v in rows.items() if v["degenerate"]
        ),
        "episodes_total": sum(v["dormancy_episodes"] for v in rows.values()),
        "per_source": rows,
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------


def load_history(path: Path) -> tuple[dict[str, list[date]], dict]:
    """Full per-source change days from `fetch_prior_history.py`'s saved output.

    Sources are dropped, never half-trusted, on the same two conditions
    `detect_silence.prior_days_by_repo` uses: a failed fetch, or in-window days
    that disagree with the earlier measurement. A source whose two derivations
    disagree is measuring something different, and splicing it in would put that
    difference inside the detector where it reads as a gap.
    """
    payload = json.loads(path.read_text())
    history: dict[str, list[date]] = {}
    dropped: list[str] = []
    for entry in payload.get("repos", []):
        agreement = entry.get("window_agreement", {})
        if entry.get("status") != "ok" or (
            agreement.get("comparable") and not agreement.get("agrees")
        ):
            dropped.append(entry.get("repo", "?"))
            continue
        days = sorted({date.fromisoformat(d) for d in entry.get("change_days", [])})
        if days:
            history[entry["repo"]] = days
        else:
            dropped.append(entry["repo"])
    payload["_dropped"] = dropped
    return history, payload


def observation_end(history: dict[str, list[date]], payload: dict) -> date:
    """Last day any source was observed on.

    Taken from the data rather than from `fetched_at`, so a trailing gap can
    never be inflated by the clock between the fetch and this run.
    """
    return max(days[-1] for days in history.values())


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def render(report: dict) -> str:
    out: list[str] = []
    meta = report["input"]
    out.append("Source-silence detector — held-out validation of the anchor choice")
    out.append("")
    out.append(f"  history fetched ....... {meta['fetched_at']}")
    out.append(f"  sources ............... {meta['sources']}")
    out.append(f"  change days ........... {meta['change_days']}")
    out.append(f"  observed through ...... {meta['observed_through']}")
    out.append(f"  dormancy label ........ gap >= {report['dormancy_days']}d")
    out.append(
        f"  nuisance budget ....... {report['budget_days_per_source_year']} alarm-days per source-year"
    )
    out.append("")

    out.append("In-sample sweep (where p99 was both chosen and scored)")
    out.append(f"  {'anchor':14s} {'recall':>12s} {'med lat':>8s} {'nuis/src-yr':>12s} {'nuis days':>10s}")
    for row in report["in_sample"]:
        recall = (
            f"{row['episodes_detected']}/{row['episodes_evaluable']}"
            if row["episodes_evaluable"]
            else "-"
        )
        lat = row["median_latency_days"]
        out.append(
            f"  {row['anchor']:14s} {recall:>12s} "
            f"{('-' if lat is None else f'{lat:g}'):>8s} "
            f"{row['nuisance_days_per_source_year']:>12} {row['nuisance_alarm_days']:>10}"
        )
    out.append("")

    loso = report["leave_one_source_out"]
    out.append("Leave-one-source-out (each source scored by an anchor it did not help choose)")
    out.append(f"  {'held-out source':38s} {'picked':10s} {'test':>8s} {'lat':>5s} {'nuis/yr':>8s}")
    for fold in loso["folds"]:
        t = fold["test"]
        test = f"{t['episodes_detected']}/{t['episodes_evaluable']}" if t["episodes_evaluable"] else "-"
        lat = t["median_latency_days"]
        out.append(
            f"  {fold['held_out']:38s} {fold['selected_anchor']:10s} {test:>8s} "
            f"{('-' if lat is None else f'{lat:g}'):>5s} {t['nuisance_days_per_year']:>8}"
        )
    pooled = loso["held_out_pooled"]
    out.append("")
    out.append(
        f"  pooled held-out: {pooled['episodes_detected']}/{pooled['episodes_evaluable']} episodes, "
        f"median latency {pooled['median_latency_days']}d, "
        f"{pooled['nuisance_days_per_source_year']} nuisance alarm-days per source-year"
    )
    out.append(
        f"  anchor selected: {', '.join(loso['anchors_selected'])}"
        + ("  (unanimous across folds)" if loso["unanimous"] else "  (NOT unanimous)")
    )
    out.append("")

    out.append("Held-out recall as a function of the nuisance budget")
    out.append(f"  {'budget/src-yr':>13s} {'anchor':>26s} {'held-out':>10s} {'lat':>6s} {'actual nuis':>12s}")
    for row in report["budget_sweep"]:
        held = f"{row['held_out_detected']}/{row['held_out_episodes']}"
        lat = row["held_out_median_latency_days"]
        out.append(
            f"  {row['budget_days_per_source_year']:>13g} {', '.join(row['anchors_selected']):>26s} "
            f"{held:>10s} {('-' if lat is None else f'{lat:g}'):>6s} "
            f"{row['held_out_nuisance_days_per_source_year']:>12}"
        )
    out.append("")

    out.append("Does `max` decay with history length? (detection rate by age of source at episode)")
    names = [n for _, _, n in AGE_BUCKETS]
    out.append("  " + f"{'anchor':14s}" + "".join(f"{n:>12s}" for n in names))
    for row in report["anchor_decay"]:
        cells = []
        for n in names:
            b = row["by_age"][n]
            cells.append(f"{b['detected']}/{b['episodes']}" if b["episodes"] else "-")
        out.append("  " + f"{row['anchor']:14s}" + "".join(f"{c:>12s}" for c in cells))
    out.append("")

    deg = report["quantile_degeneracy"]
    out.append(
        f"Where q={deg['quantile']:g} collapses into `max` "
        f"(nearest rank needs >= {deg['gaps_needed_for_a_non_degenerate_anchor']} gaps)"
    )
    out.append(
        f"  {'source':36s} {'gaps':>5s} {'q==max':>7s} {'thresh':>8s} {'episodes':>9s} {'q':>4s} {'max':>4s}"
    )
    for repo, row in deg["per_source"].items():
        out.append(
            f"  {repo:36s} {row['closed_gaps']:5d} {str(row['degenerate']):>7s} "
            f"{row['final_threshold_quantile']:>8} {row['dormancy_episodes']:>9d} "
            f"{row['detected_quantile']:>4d} {row['detected_max']:>4d}"
        )
    out.append(
        f"  -> {deg['episodes_on_degenerate_sources']} of {deg['episodes_total']} episodes sit on "
        f"sources where the recommended anchor is exactly `max`: "
        f"{', '.join(deg['degenerate_sources']) or 'none'}"
    )
    out.append("")

    out.append("Sensitivity of the dormancy label")
    out.append(f"  {'label':>10s} {'episodes':>9s} {'held-out recall':>16s} {'anchors picked':>28s}")
    for row in report["dormancy_sweep"]:
        out.append(
            f"  >= {row['dormancy_days']:4d}d {row['episodes_evaluable']:9d} "
            f"{str(row['held_out_recall']):>16s} {', '.join(row['anchors_selected']):>28s}"
        )
    return "\n".join(out)


def build_report(path: Path, base: Config, dormancy_days: int, budget: float) -> dict:
    history, payload = load_history(path)
    if not history:
        raise SystemExit(f"no usable sources in {path}")
    end = observation_end(history, payload)

    in_sample = sweep(history, end, base, dormancy_days)
    scored = score_all_anchors(history, end, base, dormancy_days)
    loso = leave_one_source_out(history, end, base, dormancy_days, budget, scored)

    budget_sweep = []
    for b in BUDGET_GRID:
        fold = leave_one_source_out(history, end, base, dormancy_days, b, scored)
        pooled = fold["held_out_pooled"]
        budget_sweep.append(
            {
                "budget_days_per_source_year": b,
                "anchors_selected": fold["anchors_selected"],
                "unanimous": fold["unanimous"],
                "held_out_recall": pooled["recall"],
                "held_out_detected": pooled["episodes_detected"],
                "held_out_episodes": pooled["episodes_evaluable"],
                "held_out_median_latency_days": pooled["median_latency_days"],
                "held_out_nuisance_days_per_source_year": pooled["nuisance_days_per_source_year"],
            }
        )

    dormancy_sweep = []
    for d in DORMANCY_GRID:
        fold = leave_one_source_out(history, end, base, d, budget)
        dormancy_sweep.append(
            {
                "dormancy_days": d,
                "episodes_evaluable": fold["held_out_pooled"]["episodes_evaluable"],
                "held_out_recall": fold["held_out_pooled"]["recall"],
                "held_out_nuisance_days_per_source_year": fold["held_out_pooled"][
                    "nuisance_days_per_source_year"
                ],
                "anchors_selected": fold["anchors_selected"],
                "unanimous": fold["unanimous"],
            }
        )

    return {
        "input": {
            "path": path.name,
            "fetched_at": payload.get("fetched_at"),
            "sources": len(history),
            "dropped_sources": payload.get("_dropped", []),
            "change_days": sum(len(v) for v in history.values()),
            "observed_through": end.isoformat(),
        },
        "config": base.as_dict(),
        "dormancy_days": dormancy_days,
        "budget_days_per_source_year": budget,
        "in_sample": in_sample,
        "leave_one_source_out": loso,
        "budget_sweep": budget_sweep,
        "dormancy_sweep": dormancy_sweep,
        "anchor_decay": anchor_decay(history, end, base, dormancy_days),
        "quantile_degeneracy": quantile_degeneracy(history, end, base, dormancy_days, 0.99),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--prior-history", type=Path, default=DEFAULT_PRIOR)
    ap.add_argument("--dormancy-days", type=int, default=DEFAULT_DORMANCY_DAYS)
    ap.add_argument("--multiplier", type=float, default=DEFAULT_MULTIPLIER)
    ap.add_argument("--floor-days", type=int, default=DEFAULT_FLOOR_DAYS)
    ap.add_argument("--min-gaps", type=int, default=DEFAULT_MIN_GAPS)
    ap.add_argument("--warmup-days", type=int, default=DEFAULT_WARMUP_DAYS)
    ap.add_argument(
        "--budget",
        type=float,
        default=DEFAULT_BUDGET,
        help="nuisance alarm-days per source-year the selected anchor must stay under",
    )
    ap.add_argument("--json", type=Path, help="write the full report here")
    args = ap.parse_args(argv)

    base = Config(
        multiplier=args.multiplier,
        floor_days=args.floor_days,
        min_gaps=args.min_gaps,
        warmup_days=args.warmup_days,
    )
    report = build_report(args.prior_history, base, args.dormancy_days, args.budget)
    print(render(report))
    if args.json:
        args.json.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
