"""Milestone 37, H4: the break-even capital charge lambda* above which replication (m > 1 workers) beats a single
worker, from the closed-form stake of milestone 35. Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import stake_closed_partial  # noqa: E402

P = 0.1
GS = (0.5, 0.9)
KAPPAS = (0.2, 0.35, 0.5, 0.65, 0.8, 1.0)
MS = range(3, 202, 2)


def breakeven(g, k):
    """min over odd m > 1 of (m - 1) / (S(1) - m S(m)); inf when no m has a positive saving."""
    s1 = stake_closed_partial(1, g, P, k)
    best, arg = float("inf"), None
    for m in MS:
        d = s1 - m * stake_closed_partial(m, g, P, k)
        if d > 1e-12 and (m - 1) / d < best:
            best, arg = (m - 1) / d, m
    return best, arg, s1


def main():
    lines = [f"== break-even capital charge lambda* per unit stake per job (p={P}, reward = compute = 1); odd m 3..201",
             "g     kappa  S*(1)   lambda*   at m"]
    out, mn = {}, float("inf")
    for g in GS:
        for k in KAPPAS:
            b, m, s1 = breakeven(g, k)
            out[f"{g}|{k}"] = {"S1": s1, "lambda_star": None if b == float("inf") else b, "m": m}
            if b < mn:
                mn = b
            lines.append(f"{g:<5} {k:<6} {s1:6.3f}  {'inf' if b == float('inf') else f'{b:8.3f}':>8}  {m}")
    lines.append(f"== smallest break-even over all cells: {mn:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
