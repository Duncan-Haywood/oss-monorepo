#!/usr/bin/env python3
"""What a free listing would have to earn per download to be worth running.

`portfolio/research/free-listing-demand/` measured how many downloads a cold
listing gets in three candidate categories. It closed by saying, explicitly,
that it carried "no pricing signal" — it measured whether a listing gets found,
not whether being found is worth anything.

This script answers that second question without guessing a conversion rate,
by inverting it. Define

    Y = revenue per monthly download
      = r * c * p

where

    r = share of monthly downloads that represent a distinct adopting team
    c = share of adopting teams that ever pay
    p = monthly revenue per paying team

Y is the only thing that matters for the arithmetic, and every business model
for a free developer listing is some factorisation of it. Given the *measured*
download distribution D, the revenue a listing at that point in the
distribution produces is simply

    R = D * Y

so instead of assuming Y and reporting a revenue, this reports the Y each
percentile of the real distribution would need in order to clear a revenue bar.
That number is checkable by inspection ("every single download would have to
yield $5/month") in a way that a compounded three-factor guess is not.

Input is the committed results JSON from the demand study, so this runs offline
and needs no network, no credentials, and no re-fetch.

    python3 analyze_listing_economics.py --out results.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
from typing import Iterable

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT = os.path.join(
    HERE, os.pardir, "free-listing-demand", "results-2026-08-19.json"
)

# Revenue bars the analysis reports against, in USD/month.
#
#   100    - honest floor: below this a listing is a hobby, not a product line.
#   1_000  - the smallest number that could plausibly cover an agent-run
#            product line's own upkeep. The portfolio cannot state its true
#            cost floor: `agent_spend_usd` is null for every entry in
#            portfolio/ledger/2026-08.yaml, so this is a placeholder standing in
#            for a number the portfolio does not yet measure.
#   10_000 - "this is a business."
REVENUE_BARS = (100, 1_000, 10_000)

# Reference band for Y, used only to translate the required-Y numbers back into
# something familiar. These are assumptions, not measurements - see README.
#
# Each is (label, r, c, p).
Y_SCENARIOS = (
    ("pessimistic", 0.005, 0.01, 10.0),
    ("central", 0.02, 0.02, 25.0),
    ("optimistic", 0.05, 0.04, 50.0),
)

PERCENTILES = (50, 75, 90, 95, 99)

# Probability that a *cold* publisher's listing lands in its category's top
# decile. Measured against the npm registry by the study in PR #218, which
# found 4.9% for publishers with no prior package in real use, against 16.2%
# for publishers who already have one. Overridable with --cold-top-decile-prob.
#
# This is the one number here taken from work that is not yet on `main`. Every
# other figure derives from the committed demand-study JSON. Passing 0.10
# reproduces the no-handicap case (a listing drawn uniformly at random).
COLD_TOP_DECILE_PROB = 0.049


def leaf_downloads(rows: Iterable[dict]) -> list[int]:
    """Monthly downloads for leaf packages only (zero dependents).

    Same definition the demand study used: a leaf's downloads come from someone
    finding it directly, not from a parent pulling it in, so it is the closest
    available analogue to what a cold listing would see.
    """
    return sorted(r["monthly"] for r in rows if r["dependents"] == 0)


def percentile(sorted_values: list[int], pct: float) -> float:
    """Linear-interpolated percentile. Matches numpy's default."""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (len(sorted_values) - 1) * (pct / 100.0)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(sorted_values[lo])
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def share_clearing(sorted_values: list[int], threshold: float) -> float:
    """Share of listings whose downloads are >= threshold."""
    if not sorted_values:
        return 0.0
    n = sum(1 for v in sorted_values if v >= threshold)
    return n / len(sorted_values)


def percentile_of(sorted_values: list[int], threshold: float) -> float:
    """Percentile rank a listing must reach to hit `threshold` downloads."""
    return 100.0 * (1.0 - share_clearing(sorted_values, threshold))


def expected_downloads_cold(leaves: list[int], top_decile_prob: float) -> dict:
    """Expected downloads for a listing published by a publisher with no audience.

    The unconditional mean is the wrong expectation to hand a cold publisher:
    it is dominated by the top decile, and a cold publisher reaches that decile
    at roughly a third of the base rate. So stratify at the top decile and
    re-weight:

        E[D | cold] = P_cold(top) * mean(top decile)
                    + (1 - P_cold(top)) * mean(everything below)

    The approximation is that a cold publisher's listing, conditional on which
    stratum it lands in, is an average member of that stratum. That is
    generous - within the top decile, cold publishers cluster at its bottom -
    so this is an upper bound on the cold expectation, which is the direction
    an argument against spending should err in.
    """
    if not leaves:
        return {}
    cut = max(1, round(len(leaves) * 0.10))
    top = leaves[-cut:]
    rest = leaves[:-cut] or top
    mean_top = statistics.fmean(top)
    mean_rest = statistics.fmean(rest)
    return {
        "top_decile_prob_cold": top_decile_prob,
        "mean_top_decile": mean_top,
        "mean_below_top_decile": mean_rest,
        "expected_downloads_cold": (
            top_decile_prob * mean_top + (1 - top_decile_prob) * mean_rest
        ),
        "expected_downloads_uniform": statistics.fmean(leaves),
    }


def analyse_category(key: str, cat: dict, top_decile_prob: float) -> dict:
    rows = cat["rows"]
    leaves = leaf_downloads(rows)
    n = len(leaves)

    cold = expected_downloads_cold(leaves, top_decile_prob)

    dist = {
        "n_leaf_listings": n,
        "mean": statistics.fmean(leaves) if leaves else 0.0,
        "max": leaves[-1] if leaves else 0,
        "percentiles": {str(p): percentile(leaves, p) for p in PERCENTILES},
    }

    # A. What Y each percentile needs to clear each revenue bar.
    required_y = {}
    for p in PERCENTILES:
        d = percentile(leaves, p)
        required_y[str(p)] = {
            str(bar): (bar / d if d > 0 else None) for bar in REVENUE_BARS
        }
    # The mean is reported too, as a deliberately generous upper bound: a cold
    # listing is worse than the average listing, not better.
    required_y["mean"] = {
        str(bar): (bar / dist["mean"] if dist["mean"] > 0 else None)
        for bar in REVENUE_BARS
    }

    # B. Under each reference Y, the revenue at each percentile, plus the
    #    percentile and download count a listing must reach to clear each bar.
    scenarios = {}
    for label, r, c, p_arpu in Y_SCENARIOS:
        y = r * c * p_arpu
        revenue_at = {
            str(p): percentile(leaves, p) * y for p in PERCENTILES
        }
        revenue_at["mean"] = dist["mean"] * y
        bars = {}
        for bar in REVENUE_BARS:
            downloads_needed = bar / y
            bars[str(bar)] = {
                "downloads_needed": downloads_needed,
                "share_of_listings_clearing": share_clearing(
                    leaves, downloads_needed
                ),
                "percentile_needed": percentile_of(leaves, downloads_needed),
            }
        scenarios[label] = {
            "r_downloads_to_adopting_team": r,
            "c_adopter_to_payer": c,
            "p_monthly_arpu_usd": p_arpu,
            "y_usd_per_monthly_download": y,
            "monthly_revenue_at_percentile": revenue_at,
            "revenue_bars": bars,
            "expected_monthly_revenue_cold": cold["expected_downloads_cold"] * y,
            "expected_monthly_revenue_uniform": (
                cold["expected_downloads_uniform"] * y
            ),
        }

    return {
        "candidate": cat.get("candidate"),
        "distribution": dist,
        "cold_publisher": cold,
        "required_y_usd_per_monthly_download": required_y,
        "scenarios": scenarios,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default=DEFAULT_INPUT, help="demand-study results JSON")
    ap.add_argument("--out", help="write results JSON here")
    ap.add_argument(
        "--cold-top-decile-prob",
        type=float,
        default=COLD_TOP_DECILE_PROB,
        help="P(top decile) for a publisher with no prior audience "
             "(default %(default)s; pass 0.10 for the no-handicap case)",
    )
    args = ap.parse_args()

    with open(args.input) as fh:
        demand = json.load(fh)

    categories = {
        key: analyse_category(key, cat, args.cold_top_decile_prob)
        for key, cat in sorted(demand["categories"].items())
    }

    result = {
        "input": {
            "path": os.path.relpath(args.input, HERE),
            "measured_at": demand.get("measured_at"),
            "source": demand.get("method", {}).get("source"),
        },
        "model": {
            "identity": "Y = r * c * p; monthly revenue = downloads * Y",
            "revenue_bars_usd_per_month": list(REVENUE_BARS),
            "note": (
                "Y is derived, not measured. The download distribution is "
                "measured. Required-Y figures depend on no assumption; the "
                "named scenarios do."
            ),
        },
        "categories": categories,
    }

    if args.out:
        with open(args.out, "w") as fh:
            json.dump(result, fh, indent=2, sort_keys=True)
            fh.write("\n")

    for key, cat in categories.items():
        dist = cat["distribution"]
        print(f"\n{key}  ({cat['candidate']})")
        print(f"  n={dist['n_leaf_listings']}  "
              f"median={dist['percentiles']['50']:,.0f}  "
              f"p90={dist['percentiles']['90']:,.0f}  "
              f"p99={dist['percentiles']['99']:,.0f}  "
              f"mean={dist['mean']:,.0f} downloads/month")
        req = cat["required_y_usd_per_monthly_download"]
        print("  $/download-month needed for $1,000/mo:")
        for p in ("50", "90", "99", "mean"):
            v = req[p]["1000"]
            print(f"    at {p:>4}: ${v:,.4f}")
        cold = cat["cold_publisher"]
        print(f"  E[downloads | cold publisher] = "
              f"{cold['expected_downloads_cold']:,.0f}/mo "
              f"(vs {cold['expected_downloads_uniform']:,.0f} unconditional)")
        for label, sc in cat["scenarios"].items():
            bar = sc["revenue_bars"]["1000"]
            print(f"  scenario {label:12s} Y=${sc['y_usd_per_monthly_download']:.4f}"
                  f"  -> $1,000/mo needs {bar['downloads_needed']:,.0f} dl/mo"
                  f"  = top {100 - bar['percentile_needed']:.2f}%"
                  f"  | E[rev|cold] = ${sc['expected_monthly_revenue_cold']:,.0f}/mo")


if __name__ == "__main__":
    main()
