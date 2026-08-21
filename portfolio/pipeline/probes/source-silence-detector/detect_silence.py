#!/usr/bin/env python3
"""Derive a per-source expected-cadence threshold and alert when a register goes quiet.

This builds the one thing
[`portfolio/research/register-change-rate/`](../../../research/register-change-rate/README.md)
§3 names as a build requirement rather than a finding:

> A mirror-fed product needs a per-source expected-cadence threshold derived
> from its own history (a 6-day gap is normal for KEV, a 49-day gap is normal
> for `congress-legislators`) and an alert when the current gap exceeds it.

and which [`public-record-watch`](../../candidates/public-record-watch.md) lists
under *where it can fail*:

> alert on pipeline silence, not just on findings — a monitor that quietly
> stopped is worse than no monitor.

The probe tests whether that threshold can actually be *derived*, and what it
costs when it can't. It is a backtest, not a monitor: it replays the 180-day
window already measured in `results-2026-08-20.json` one day at a time, and at
each day uses only the history a monitor would have had on that day.

House rules (`portfolio/research/README.md`): read-only, standard library only,
no credentials, publishes nothing, registers nothing, cannot spend money. This
script makes **no network calls at all** — it derives everything from the saved
per-commit records of the earlier probe, which is what makes its claims
checkable without re-cloning nine repositories.

Usage:
    python3 detect_silence.py
    python3 detect_silence.py --sweep
    python3 detect_silence.py --json results-YYYY-MM-DD.json

Offline tests: python3 -m unittest discover -s portfolio/pipeline/probes/source-silence-detector
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DEFAULT_RESULTS = (
    Path(__file__).resolve().parents[3]
    / "research"
    / "register-change-rate"
    / "results-2026-08-20.json"
)

# ---------------------------------------------------------------------------
# Detector configuration
# ---------------------------------------------------------------------------
# The rule is deliberately the simplest thing that could work, because the
# question this probe answers is "is a per-source threshold derivable at all",
# not "which estimator is best". A fancier estimator that still cannot be fitted
# on a two-commit history would fail in exactly the same place.

DEFAULT_MULTIPLIER = 1.5  # how far past the worst historical gap counts as wrong
DEFAULT_FLOOR_DAYS = 7  # never page a human for a source that is a day late
DEFAULT_MIN_GAPS = 5  # gaps needed before a per-source threshold is trusted
DEFAULT_WARMUP_DAYS = 30  # no alarms while the monitor is still learning
DEFAULT_FALLBACK_DAYS = 30  # used only by --fallback fixed

# Which historical gap the threshold is anchored to. `max` is the rule
# `register-change-rate` specified and this probe first measured; `quantile` is
# the alternative it turned out to need. The distinction only becomes visible
# with full history, which is why the first pass could not have found it: on 180
# days of a source that changes daily, the max gap and the 99th percentile gap
# are the same number.
DEFAULT_ANCHOR = "max"
DEFAULT_QUANTILE = 0.99  # nearest-rank; 1.0 reproduces `max` exactly

# Ground truth for "this source went quiet and nobody said so" is taken from the
# data rather than hand-labelled: a source whose trailing silence at the window's
# end exceeds this many days had stopped publishing while the window was still
# running. At 30 days the two `register-change-rate` controls (73d and 149d)
# qualify and no live source comes within 28 days of the line, so the split is
# not sensitive to the exact value.
QUIET_GROUND_TRUTH_DAYS = 30


class Config:
    """Detector parameters. Plain object rather than a dataclass to stay stdlib-plain."""

    def __init__(
        self,
        multiplier: float = DEFAULT_MULTIPLIER,
        floor_days: int = DEFAULT_FLOOR_DAYS,
        min_gaps: int = DEFAULT_MIN_GAPS,
        warmup_days: int = DEFAULT_WARMUP_DAYS,
        fallback: str = "none",
        fallback_days: int = DEFAULT_FALLBACK_DAYS,
        anchor: str = DEFAULT_ANCHOR,
        quantile: float = DEFAULT_QUANTILE,
    ) -> None:
        self.multiplier = multiplier
        self.floor_days = floor_days
        self.min_gaps = min_gaps
        self.warmup_days = warmup_days
        self.fallback = fallback
        self.fallback_days = fallback_days
        self.anchor = anchor
        self.quantile = quantile

    def as_dict(self) -> dict:
        return {
            "multiplier": self.multiplier,
            "floor_days": self.floor_days,
            "min_gaps": self.min_gaps,
            "warmup_days": self.warmup_days,
            "fallback": self.fallback,
            "fallback_days": self.fallback_days,
            "anchor": self.anchor,
            "quantile": self.quantile,
        }


# ---------------------------------------------------------------------------
# Derivation
# ---------------------------------------------------------------------------


def change_days(commits: list[dict], since_ts: int, until_ts: int) -> list[date]:
    """Distinct UTC days carrying a change, inside the window, ascending.

    The window filter matches `probe_registers.summarise` exactly (inclusive on
    both ends) so this probe and the measurement it reads cannot disagree about
    which commits are in scope.
    """
    days = {
        datetime.fromtimestamp(c["ts"], timezone.utc).date()
        for c in commits
        if since_ts <= c["ts"] <= until_ts
    }
    return sorted(days)


def gaps_between(days: list[date]) -> list[int]:
    """Whole-day gaps between consecutive change days."""
    return [(b - a).days for a, b in zip(days, days[1:])]


def anchor_gap(gaps: list[int], cfg: Config) -> int:
    """The historical gap the threshold is built from.

    `max` is the rule as specified: "is this longer than this source's normal
    worst". Its defect is that it is **monotonically non-decreasing in history
    length** — every long gap a source survives permanently raises its own alarm
    threshold — so the sources most likely to go dormant are exactly the ones
    whose threshold has already been stretched past any silence worth alarming
    on. Full history makes that stretch enormous rather than curing it.

    `quantile` (nearest-rank) is not monotone: it converges on what the source
    normally does and treats one historical dormancy as the outlier it is.
    Quantile 1.0 is `max`, so the two are one dial rather than two rules.
    """
    if cfg.anchor == "quantile":
        ordered = sorted(gaps)
        # Clamped at both ends so a quantile outside [0, 1] degrades to the
        # nearest sensible anchor rather than raising from inside the day loop.
        rank = min(len(ordered), max(1, math.ceil(cfg.quantile * len(ordered))))
        return ordered[rank - 1]
    return max(gaps)


def cadence_threshold(gaps: list[int], cfg: Config) -> int | None:
    """Per-source silence threshold in days, or None when history is too thin."""
    if len(gaps) < cfg.min_gaps:
        return None
    return max(cfg.floor_days, math.ceil(anchor_gap(gaps, cfg) * cfg.multiplier))


def _pooled_threshold(per_source_thresholds: list[int], cfg: Config) -> int | None:
    """Fallback for an uncalibrated source: the median of what peers needed.

    Recorded as a fallback rather than a recommendation. Sources in one portfolio
    can differ by an order of magnitude in cadence (1 day for `malicious-packages`,
    49 for `congress-legislators`), so a pooled number is wrong for both ends by
    construction. It is here to be measured, not to be trusted.
    """
    usable = [t for t in per_source_thresholds if t is not None]
    if not usable:
        return None
    return max(cfg.floor_days, int(statistics.median(usable)))


def evaluate_source(
    days: list[date],
    since: date,
    until: date,
    cfg: Config,
    pooled_by_day: dict[date, int] | None = None,
    prior: list[date] | None = None,
) -> dict:
    """Replay the window one day at a time with no lookahead.

    On each day the detector sees only changes at or before that day, which is
    the only way a backtest of a monitor means anything.

    `prior` is the source's change days from *before* the window, as fetched by
    `fetch_prior_history.py`. Supplying it models a monitor that cloned full
    history on the day it was switched on; omitting it models one whose history
    begins at the window's first day, which is what the saved `--shallow-since`
    records force and what this probe originally measured. Prior days are used
    for calibration and for "when did this source last change", never for
    scoring: ground truth still comes from in-window behaviour alone.
    """
    prior = prior or []
    alarms: list[dict] = []
    calibrated_days = 0
    total_days = 0
    first_calibrated: date | None = None

    day = since
    while day <= until:
        total_days += 1
        idx = bisect.bisect_right(days, day)
        history = prior + days[:idx]
        seen_gaps = gaps_between(history)
        threshold = cadence_threshold(seen_gaps, cfg)
        source = "per-source"

        if threshold is not None:
            calibrated_days += 1
            if first_calibrated is None:
                first_calibrated = day
        else:
            if cfg.fallback == "fixed":
                threshold, source = max(cfg.floor_days, cfg.fallback_days), "fixed"
            elif cfg.fallback == "pooled" and pooled_by_day is not None:
                pooled = pooled_by_day.get(day)
                if pooled is not None:
                    threshold, source = pooled, "pooled"

        in_warmup = (day - since).days < cfg.warmup_days
        if threshold is not None and not in_warmup:
            last = history[-1] if history else since
            current_gap = (day - last).days
            if current_gap > threshold:
                # Terminal iff the source never changes again inside the window:
                # the data decides this, so no source is hand-labelled dead.
                terminal = bisect.bisect_right(days, day) >= len(days)
                alarms.append(
                    {
                        "day": day.isoformat(),
                        "gap": current_gap,
                        "threshold": threshold,
                        "threshold_source": source,
                        "terminal": terminal,
                    }
                )
        day += timedelta(days=1)

    # Derived from the whole window rather than from the loop's last iteration,
    # so the summary does not depend on where the loop happened to stop.
    return _score(days, alarms, calibrated_days, total_days, first_calibrated, until, cfg, prior)


def _score(
    days: list[date],
    alarms: list[dict],
    calibrated_days: int,
    total_days: int,
    first_calibrated: date | None,
    until: date,
    cfg: Config,
    prior: list[date] | None = None,
) -> dict:
    prior = prior or []
    # The threshold and gap columns describe what the detector was fitted on, so
    # they span prior history too. The ground-truth columns below deliberately do
    # not: whether a source went quiet is a fact about the window, and letting
    # prior history touch it would let the calibration change its own exam.
    final_gaps = gaps_between(prior + days)
    terminal = [a for a in alarms if a["terminal"]]
    resolved = [a for a in alarms if not a["terminal"]]
    last_change = days[-1] if days else None

    # Alarms raised before the source's first *observed* change are not evidence
    # about the detector. The saved records come from a `--shallow-since` clone,
    # so history earlier than the window was never fetched; a source whose first
    # in-window commit lands late looks silent from day one for a reason that is
    # an artifact of the clone depth, not a property of the source. Counted
    # separately so the honest nuisance figure is the mid-window one.
    #
    # With prior history supplied, that artifact cannot arise: the monitor knows
    # when the source last changed before the window, so an early alarm is a real
    # claim about a real silence and is counted as mid-window like any other.
    # This is why the cold-start column goes to zero under `--prior-history`
    # rather than staying constant — the category stops existing.
    first_change = prior[0] if prior else (days[0] if days else None)
    def _is_cold_start(alarm: dict) -> bool:
        return first_change is None or date.fromisoformat(alarm["day"]) < first_change

    cold_start = [a for a in resolved if _is_cold_start(a)]
    mid_window = [a for a in resolved if not _is_cold_start(a)]

    latency = None
    if terminal and last_change is not None:
        first_terminal = date.fromisoformat(terminal[0]["day"])
        latency = (first_terminal - last_change).days

    return {
        "change_days": len(days),
        "final_threshold": cadence_threshold(final_gaps, cfg),
        "median_gap": statistics.median(final_gaps) if final_gaps else None,
        "max_gap": max(final_gaps) if final_gaps else None,
        "calibrated_day_share": round(calibrated_days / total_days, 3) if total_days else 0.0,
        "first_calibrated": first_calibrated.isoformat() if first_calibrated else None,
        "last_change": last_change.isoformat() if last_change else None,
        "trailing_silence_days": (until - last_change).days if last_change else None,
        "quiet_at_window_end": bool(
            last_change is not None and (until - last_change).days > QUIET_GROUND_TRUTH_DAYS
        ),
        "detected_terminal_silence": bool(terminal),
        "detection_latency_days": latency,
        "terminal_alarm_days": len(terminal),
        "resolved_alarm_days": len(resolved),
        "cold_start_alarm_days": len(cold_start),
        "mid_window_alarm_days": len(mid_window),
        "alarms": alarms,
    }


def prior_days_by_repo(prior_payload: dict, since: date) -> dict[str, list[date]]:
    """Pre-window change days per repo, from `fetch_prior_history.py`'s output.

    Only days strictly before the window are kept. The in-window days keep coming
    from the saved measurement, which the fetcher verified it agrees with
    day-for-day, so the two halves of the history are the same kind of number and
    the seam introduces nothing.

    A source whose fetch did not succeed, or whose in-window days disagreed with
    the saved records, is dropped rather than half-trusted: a mismatch means the
    two derivations are measuring different things, and splicing them would put
    that difference inside the detector where it would read as a gap.
    """
    out: dict[str, list[date]] = {}
    for entry in prior_payload.get("repos", []):
        if entry.get("status") != "ok":
            continue
        agreement = entry.get("window_agreement", {})
        if agreement.get("comparable") and not agreement.get("agrees"):
            continue
        days = [date.fromisoformat(d) for d in entry.get("change_days", [])]
        out[entry["repo"]] = [d for d in days if d < since]
    return out


def evaluate_all(payload: dict, cfg: Config, prior_payload: dict | None = None) -> dict:
    since_ts = payload["window"]["since_ts"]
    until_ts = payload["window"]["until_ts"]
    since = datetime.fromtimestamp(since_ts, timezone.utc).date()
    until = datetime.fromtimestamp(until_ts, timezone.utc).date()

    days_by_repo = {
        entry["repo"]: change_days(entry["commits"], since_ts, until_ts)
        for entry in payload["repos"]
        if entry.get("status") == "ok"
    }
    prior_by_repo = prior_days_by_repo(prior_payload, since) if prior_payload else {}

    pooled_by_day = (
        _pooled_schedule(days_by_repo, since, until, cfg, prior_by_repo)
        if cfg.fallback == "pooled"
        else None
    )

    rows = {
        repo: evaluate_source(days, since, until, cfg, pooled_by_day, prior_by_repo.get(repo))
        for repo, days in days_by_repo.items()
    }
    return {
        "source_measurement": payload.get("measured_at"),
        "window": {"since": since.isoformat(), "until": until.isoformat()},
        "config": cfg.as_dict(),
        "calibration": {
            "prior_history": bool(prior_payload),
            "fetched_at": (prior_payload or {}).get("fetched_at"),
            "sources_with_prior": sorted(k for k, v in prior_by_repo.items() if v),
        },
        "sources": rows,
        "totals": _totals(rows),
    }


def _pooled_schedule(
    days_by_repo: dict[str, list[date]],
    since: date,
    until: date,
    cfg: Config,
    prior_by_repo: dict[str, list[date]] | None = None,
) -> dict[date, int]:
    """Per-day pooled threshold, using only history available on that day."""
    prior_by_repo = prior_by_repo or {}
    schedule: dict[date, int] = {}
    day = since
    while day <= until:
        thresholds = []
        for repo, days in days_by_repo.items():
            history = prior_by_repo.get(repo, []) + days[: bisect.bisect_right(days, day)]
            thresholds.append(cadence_threshold(gaps_between(history), cfg))
        pooled = _pooled_threshold(thresholds, cfg)
        if pooled is not None:
            schedule[day] = pooled
        day += timedelta(days=1)
    return schedule


def _totals(rows: dict[str, dict]) -> dict:
    quiet_truth = [k for k, r in rows.items() if r["quiet_at_window_end"]]
    caught = [k for k in quiet_truth if rows[k]["detected_terminal_silence"]]
    missed = [k for k in quiet_truth if not rows[k]["detected_terminal_silence"]]
    never_calibrated = [k for k, r in rows.items() if r["final_threshold"] is None]
    return {
        "sources": len(rows),
        "never_calibrated": sorted(never_calibrated),
        "quiet_at_window_end": len(quiet_truth),
        "quiet_sources": sorted(quiet_truth),
        "missed_quiet_sources": sorted(missed),
        "detected_terminal_silence": len(caught),
        "resolved_alarm_days_total": sum(r["resolved_alarm_days"] for r in rows.values()),
        "mid_window_alarm_days_total": sum(r["mid_window_alarm_days"] for r in rows.values()),
        "cold_start_alarm_days_total": sum(r["cold_start_alarm_days"] for r in rows.values()),
    }


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def render(result: dict) -> str:
    cfg = result["config"]
    out = [
        f"Window {result['window']['since']} .. {result['window']['until']}  "
        f"(from measurement {result['source_measurement']})",
        f"Rule: alarm when current gap > max("
        + (
            f"p{cfg['quantile'] * 100:g} historical gap"
            if cfg["anchor"] == "quantile"
            else "worst historical gap"
        )
        + f" x {cfg['multiplier']}, "
        f"{cfg['floor_days']}d), needs >= {cfg['min_gaps']} gaps to calibrate, "
        f"{cfg['warmup_days']}d warmup, fallback={cfg['fallback']}",
        "Calibrated on: "
        + (
            f"full history ({len(result['calibration']['sources_with_prior'])} of "
            f"{len(result['sources'])} sources have pre-window days), "
            f"fetched {result['calibration']['fetched_at']}"
            if result.get("calibration", {}).get("prior_history")
            else "the observation window only (no pre-window history)"
        ),
        "",
        f"{'source':38s} {'thr':>5s} {'med':>5s} {'max':>5s} {'cal%':>6s} "
        f"{'last change':>12s} {'quiet?':>7s} {'lat':>5s} {'mid-win':>8s} {'cold':>5s}",
    ]
    for repo, r in sorted(result["sources"].items()):
        thr = "--" if r["final_threshold"] is None else str(r["final_threshold"])
        med = "--" if r["median_gap"] is None else f"{r['median_gap']:g}"
        mx = "--" if r["max_gap"] is None else str(r["max_gap"])
        lat = "--" if r["detection_latency_days"] is None else str(r["detection_latency_days"])
        # A source that went quiet and was not detected must not render as "-":
        # that is the failure this probe exists to report, and a dash reads as
        # "healthy".
        if r["quiet_at_window_end"]:
            quiet = "CAUGHT" if r["detected_terminal_silence"] else "MISSED"
        else:
            quiet = "-"
        out.append(
            f"{repo:38s} {thr:>5s} {med:>5s} {mx:>5s} "
            f"{r['calibrated_day_share'] * 100:5.0f}% {r['last_change'] or '--':>12s} "
            f"{quiet:>7s} {lat:>5s} {r['mid_window_alarm_days']:>8d} {r['cold_start_alarm_days']:>5d}"
        )
    t = result["totals"]
    out += [
        "",
        f"sources still silent at window end (trailing > {QUIET_GROUND_TRUTH_DAYS}d): "
        f"{t['quiet_at_window_end']}  |  of those, alarmed: {t['detected_terminal_silence']}",
        f"mid-window nuisance alarm-days (the real cost): {t['mid_window_alarm_days_total']}",
        f"cold-start alarm-days (artifact of the shallow clone, not the detector): "
        f"{t['cold_start_alarm_days_total']}",
        f"never calibrated in the window: {', '.join(t['never_calibrated']) or 'none'}",
    ]
    return "\n".join(out)


def render_sweep(payload: dict, base: Config, prior_payload: dict | None = None) -> str:
    """Sensitivity of the headline numbers to the two parameters that matter."""
    out = [
        "Sensitivity sweep (fallback held at "
        f"{base.fallback!r}); 'caught' counts sources whose terminal silence alarmed.",
        "",
        f"{'multiplier':>10s} {'min_gaps':>9s} {'caught':>7s} {'mid-win':>8s} "
        f"{'cold':>5s} {'uncal':>6s} {'worst latency':>14s}",
    ]
    for multiplier in (1.0, 1.5, 2.0, 3.0):
        for min_gaps in (2, 5, 10):
            cfg = Config(
                multiplier=multiplier,
                floor_days=base.floor_days,
                min_gaps=min_gaps,
                warmup_days=base.warmup_days,
                fallback=base.fallback,
                fallback_days=base.fallback_days,
                anchor=base.anchor,
                quantile=base.quantile,
            )
            r = evaluate_all(payload, cfg, prior_payload)
            t = r["totals"]
            lats = [
                s["detection_latency_days"]
                for s in r["sources"].values()
                if s["quiet_at_window_end"] and s["detection_latency_days"] is not None
            ]
            worst = f"{max(lats)}d" if lats else "--"
            out.append(
                f"{multiplier:>10.1f} {min_gaps:>9d} "
                f"{t['detected_terminal_silence']}/{t['quiet_at_window_end']:<5d} "
                f"{t['mid_window_alarm_days_total']:>8d} {t['cold_start_alarm_days_total']:>5d} "
                f"{len(t['never_calibrated']):>6d} {worst:>14s}"
            )
    return "\n".join(out)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    ap.add_argument("--multiplier", type=float, default=DEFAULT_MULTIPLIER)
    ap.add_argument("--floor-days", type=int, default=DEFAULT_FLOOR_DAYS)
    ap.add_argument("--min-gaps", type=int, default=DEFAULT_MIN_GAPS)
    ap.add_argument("--warmup-days", type=int, default=DEFAULT_WARMUP_DAYS)
    ap.add_argument("--fallback", choices=("none", "fixed", "pooled"), default="none")
    ap.add_argument("--fallback-days", type=int, default=DEFAULT_FALLBACK_DAYS)
    ap.add_argument(
        "--anchor",
        choices=("max", "quantile"),
        default=DEFAULT_ANCHOR,
        help="which historical gap the threshold is built from (default: max, the rule as specified)",
    )
    ap.add_argument(
        "--quantile",
        type=float,
        default=DEFAULT_QUANTILE,
        help="nearest-rank quantile for --anchor quantile; 1.0 reproduces --anchor max",
    )
    ap.add_argument("--sweep", action="store_true", help="print the parameter sensitivity table")
    ap.add_argument(
        "--prior-history",
        type=Path,
        help=(
            "calibrate on full history from fetch_prior_history.py, instead of on "
            "the observation window alone"
        ),
    )
    ap.add_argument("--json", type=Path, help="write the full result, alarms included")
    args = ap.parse_args(argv)

    if not args.results.exists():
        print(f"results file not found: {args.results}", file=sys.stderr)
        return 2

    prior_payload = None
    if args.prior_history:
        if not args.prior_history.exists():
            print(f"prior-history file not found: {args.prior_history}", file=sys.stderr)
            return 2
        prior_payload = json.loads(args.prior_history.read_text())

    payload = json.loads(args.results.read_text())
    cfg = Config(
        multiplier=args.multiplier,
        floor_days=args.floor_days,
        min_gaps=args.min_gaps,
        warmup_days=args.warmup_days,
        fallback=args.fallback,
        fallback_days=args.fallback_days,
        anchor=args.anchor,
        quantile=args.quantile,
    )

    result = evaluate_all(payload, cfg, prior_payload)
    print(render(result))
    if args.sweep:
        print()
        print(render_sweep(payload, cfg, prior_payload))
    if args.json:
        args.json.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
