"""Paired comparison of wait vs avoid on identical loads (seeds), for hanger-avoid's unsettled aiming gain.

hanger-avoid compared two separate bootstrap intervals; the wait and avoid runs share seeds, so the per-load
difference removes the load-to-load variance both arms see. Stdlib only.
"""
import random
import statistics
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RESEARCH / "hanger-avoid" / "src"))
from hanger_avoid.avoid import CellParams, PickParams, replace, replicate  # noqa: E402,F401


def per_load(cp, policy, pp, reps, sep, avoid, seed=0):
    """done/h for each of `reps` loads; load i uses the same seed whether avoid is on or off."""
    return [r["done_per_hour"] for r in replicate(cp, policy, pp, reps, seed, sep, avoid=avoid)["_runs"]]


def paired_stats(wait, avoid, boots=2000, seed=1):
    """Mean paired difference (avoid - wait), 95% percentile bootstrap over loads, the SD of the difference,
    the unpaired (Welch-style) standard error for comparison, and the share of loads where avoiding was better."""
    assert len(wait) == len(avoid) and len(wait) > 1
    d = [a - w for w, a in zip(wait, avoid)]
    n = len(d)
    rng = random.Random(seed)
    means = sorted(statistics.fmean(rng.choices(d, k=n)) for _ in range(boots))
    se_paired = statistics.stdev(d) / n ** 0.5
    se_unpaired = (statistics.variance(wait) / n + statistics.variance(avoid) / n) ** 0.5
    return dict(mean=statistics.fmean(d), lo=means[int(0.025 * boots)], hi=means[int(0.975 * boots) - 1],
                sd=statistics.stdev(d), se_paired=se_paired, se_unpaired=se_unpaired,
                better=sum(x > 0 for x in d) / n, n=n)
