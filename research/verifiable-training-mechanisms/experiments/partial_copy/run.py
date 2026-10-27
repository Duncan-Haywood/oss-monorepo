"""Milestone 35, H4: cheaters whose outputs coincide only with probability kappa. Brute force against the closed form
S* = max(0, g / (1 - kappa (1 - p)) - r). Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import min_stake, stake_closed  # noqa: E402

KAPPAS = (1.0, 0.75, 0.5, 0.25, 0.0)
GS, PS, MS = (0.2, 0.5, 0.8), (0.05, 0.1, 0.3), (1, 2, 3, 4, 5, 6)


def main():
    worst, n, mono_bad, mono_n, zero_bad, zero_n, m1_bad, m1_n = 0.0, 0, 0, 0, 0, 0, 0, 0
    lines = ["== S* by brute force (g = 0.5, p = 0.1)", "m    " + "  ".join(f"k={k:<5}" for k in KAPPAS)]
    for m in MS:
        row = []
        for g in GS:
            for p in PS:
                vals = []
                for k in KAPPAS:
                    bf = min_stake(m, g, p, kappa=k)
                    worst = max(worst, abs(bf - stake_closed(m, g, p, kappa=k)))
                    n += 1
                    vals.append(bf)
                    if m == 1:
                        m1_n += 1
                        m1_bad += abs(bf - stake_closed(1, g, p)) > 1e-6
                    if k == 0.0 and m >= 2:
                        zero_n += 1
                        zero_bad += bf > 1e-6
                    if g == 0.5 and p == 0.1:
                        row.append(bf)
                mono_n += 1
                mono_bad += m >= 2 and any(vals[i + 1] > vals[i] + 1e-6 for i in range(len(vals) - 1))
        lines.append(f"{m:<4} " + "  ".join(f"{v:<7.3f}" for v in row))
    lines = [f"== brute force vs closed form: {n} cells (m 1..6, 5 kappas, 3 g, 3 p); max |difference| = {worst:.2e}",
             f"== m = 1 independent of kappa: {m1_n - m1_bad} of {m1_n} cells",
             f"== stake rises when kappa falls (m >= 2): {mono_bad} of {mono_n} (g, p, m) cells violate monotonicity",
             f"== stake zero at kappa = 0, m >= 2: {zero_n - zero_bad} of {zero_n} cells"] + lines
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"worst": worst, "n": n, "mono_bad": mono_bad, "zero_bad": zero_bad, "m1_bad": m1_bad},
              open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
