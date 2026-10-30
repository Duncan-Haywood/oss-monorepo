"""Milestone 33, H4: heterogeneous savings g_i, with and without side payments (transferable utility).
Brute-force least stake against the closed forms for m = 1..7, then the closed forms for m up to 51.
Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import min_stake, stake_closed_het  # noqa: E402

P = 0.1
DRAWS = 200
BF_M = range(1, 8)
CF_M = (3, 5, 7, 11, 21, 51)


def main():
    rng = np.random.default_rng(33)
    worst, tu_lt_ntu, strict_needed, strict_ok, cells = 0.0, 0, 0, 0, 0
    mean_bf = {m: [[], []] for m in BF_M}
    for m in BF_M:
        for _ in range(DRAWS if m <= 5 else 40):
            gs = list(rng.uniform(0, 1, m))
            ntu_bf, tu_bf = min_stake(m, gs, P), min_stake(m, gs, P, transfers=True)
            ntu_cf, tu_cf = stake_closed_het(gs, P), stake_closed_het(gs, P, transfers=True)
            worst = max(worst, abs(ntu_bf - ntu_cf), abs(tu_bf - tu_cf))
            cells += 1
            tu_lt_ntu += tu_bf < ntu_bf - 1e-6
            top = sorted(gs, reverse=True)[: m // 2 + 1]
            if ntu_bf > 0 and max(top) - min(top) > 1e-6:
                strict_needed += 1
                strict_ok += tu_bf > ntu_bf + 1e-9
            mean_bf[m][0].append(ntu_bf); mean_bf[m][1].append(tu_bf)
    lines = [f"== brute force vs closed form: {cells} instances (g_i ~ U(0,1), p={P}, m 1..7); max |difference| = {worst:.2e}",
             f"== TU stake below NTU stake in {tu_lt_ntu} instances; TU strictly above NTU in {strict_ok} of {strict_needed} instances where the k largest savings differ and NTU > 0",
             f"== mean least stake over draws (brute force), p={P}; the 1/m curve is S*(1)/m with S*(1) = mean of g/p - 1 at m=1",
             "m    NTU      TU       1/m curve (from NTU m=1)"]
    s1 = np.mean(mean_bf[1][0])
    for m in BF_M:
        lines.append(f"{m:<4} {np.mean(mean_bf[m][0]):<8.3f} {np.mean(mean_bf[m][1]):<8.3f} {s1 / m:.3f}")
    lines.append(f"== closed forms, {DRAWS} draws per m, mean (m up to 51)")
    lines.append("m    NTU      TU       order-stat limit NTU, TU = 0.5/p-1, 0.75/p-1 = %.2f, %.2f" % (0.5 / P - 1, 0.75 / P - 1))
    big = {}
    for m in CF_M:
        a = [[stake_closed_het(list(rng.uniform(0, 1, m)), P, transfers=t) for t in (False, True)] for _ in range(DRAWS)]
        big[m] = np.mean(a, axis=0)
        lines.append(f"{m:<4} {big[m][0]:<8.3f} {big[m][1]:<8.3f}")
    lines.append("== ratio of the mean at m=7 to the mean at m=3 (brute force): NTU %.2f, TU %.2f (refutation bar: under 0.60)"
                 % (np.mean(mean_bf[7][0]) / np.mean(mean_bf[3][0]), np.mean(mean_bf[7][1]) / np.mean(mean_bf[3][1])))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"worst": worst, "mean_bf": {m: [float(np.mean(v)) for v in mean_bf[m]] for m in BF_M},
               "closed": {m: [float(x) for x in big[m]] for m in CF_M}}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
