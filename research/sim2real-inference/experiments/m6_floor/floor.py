"""Milestone 6: a distribution-free floor on any twin-assisted lower confidence bound.

Theorem (see LOG.md, 2026-10-24 "Milestone 6"). Let L be any lower confidence bound for
mu = E[R] with P(L <= mu) >= 1 - delta for every joint law of (R, T) on [0, 1]^2, built
from m paired runs (R_i, T_i), any number of extra twin-only runs and any randomisation.
Then there is a law with perfect twin (R = T = 1) under which
P(L <= 1 - eps*) >= 1/2, eps* = 1 - (2 delta)^(1/m).
The optimal valid bound on the all-ones sample is 1 - (1 - delta^(1/m)), i.e. gap
1 - delta^(1/m), so the floor is tight to within a factor about ln2/ln(1/delta) of m * gap.
Usage: python3 floor.py   (writes results/floor.csv and results/summary_6.txt)
"""
import csv
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def floor_gap(m, delta):
    """Median-gap floor: any valid bound is at most 1 - eps* with probability >= 1/2."""
    return 1.0 - (2.0 * delta) ** (1.0 / m)


def optimal_gap(m, delta):
    """Gap of the exact valid bound on the all-ones sample (R = 1 for every pair)."""
    return 1.0 - delta ** (1.0 / m)


def eb_gap_all_ones(m, delta):
    """Maurer-Pontil empirical-Bernstein one-sided gap when the sample variance is 0."""
    return 7.0 * math.log(1.0 / delta) / (3.0 * (m - 1))


def indistinguishable_prob(m, eps, reps, rng):
    """Monte Carlo of P1(all m real outcomes equal 1) where P1 has R = 0 w.p. eps."""
    r = rng.random((reps, m)) >= eps
    return float(np.mean(r.all(axis=1)))


def main():
    delta = 0.05
    rng = np.random.default_rng(6)
    rows = []
    for m in (10, 20, 30, 60, 120, 240, 480, 1000):
        eps = floor_gap(m, delta)
        sim = indistinguishable_prob(m, eps, 200_000, rng)
        rows.append(dict(m=m, floor=eps, optimal=optimal_gap(m, delta),
                         eb=eb_gap_all_ones(m, delta),
                         approx=math.log(1 / (2 * delta)) / m,
                         p_same_exact=(1 - eps) ** m, p_same_mc=sim))
    with open(os.path.join(HERE, "results", "floor.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: (round(v, 5) if isinstance(v, float) else v) for k, v in r.items()})
    # compare with the measured gaps of milestone 3e (mean over 21 pairs)
    cmp_rows = []
    src = os.path.join(HERE, "..", "m3e_bounded_disc", "results", "bounded.csv")
    by_n = {}
    with open(src) as f:
        for r in csv.DictReader(f):
            by_n.setdefault(int(r["n"]), []).append((float(r["gap_real_eb"]), float(r["gap_bounded"])))
    lines = ["Floor on the gap of any valid 95% lower bound (m paired runs), and 3e's measured mean gaps",
             "m   floor   optimal(all-ones)  EB(all-ones)  3e real-only EB  3e bounded-disc  bounded/floor"]
    for m in sorted(by_n):
        g = np.mean(by_n[m], axis=0)
        fl = floor_gap(m, delta)
        lines.append(f"{m:<4d}{fl:7.4f}{optimal_gap(m, delta):12.4f}{eb_gap_all_ones(m, delta):15.4f}"
                     f"{g[0]:17.4f}{g[1]:17.4f}{g[1] / fl:14.1f}")
        cmp_rows.append((m, fl, g[0], g[1]))
    lines.append("")
    lines.append("check: P1 data identical to P0 data with prob (1-eps)^m = 2 delta = 0.10 at eps = floor")
    for r in rows:
        lines.append(f"m={r['m']:<5d}exact {r['p_same_exact']:.4f}  Monte Carlo {r['p_same_mc']:.4f}")
    out = "\n".join(lines)
    with open(os.path.join(HERE, "results", "summary_6.txt"), "w") as f:
        f.write(out + "\n")
    print(out)


if __name__ == "__main__":
    main()
