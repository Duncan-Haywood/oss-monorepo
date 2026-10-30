"""Milestone 34, H4: a bribable auditor. Least auditor bond B* by brute force against the closed form, m = 1..6,
then the closed form to m = 51. Run from here:  PYTHONPATH=../../src python3 run.py"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.coalition import bond_closed, min_bond, stake_closed_het  # noqa: E402

P, Q, DRAWS = 0.1, 0.02, 100
BF_M = range(1, 7)
CF_M = (1, 3, 7, 11, 21, 51)


def main():
    rng = np.random.default_rng(34)
    worst, n, inf_below, below_n, q_eq_p_bad, qp_n, s3_bad, s3_n = 0.0, 0, 0, 0, 0, 0, 0, 0
    mean_bf = {m: [] for m in BF_M}
    for m in BF_M:
        for _ in range(DRAWS if m <= 4 else 20):
            gs = list(rng.uniform(0, 1, m))
            s0 = stake_closed_het(gs, P, transfers=True)
            b0 = min_bond(m, gs, P, s0 + 1e-6, Q)
            worst = max(worst, abs(b0 - bond_closed(gs, s0 + 1e-6, Q)))
            n += 1
            mean_bf[m].append(b0)
            if s0 > 1e-3:  # workers alone can deviate just below the stake
                below_n += 1
                inf_below += min_bond(m, gs, P, s0 * 0.9, Q) == float("inf")
            qp_n += 1
            q_eq_p_bad += min_bond(m, gs, P, s0 + 1e-6, P) > 1e-6
            if b0 > 1e-6 and s0 > 1e-3:  # at stake 0, 3 x stake is the same point
                s3_n += 1
                s3_bad += not (min_bond(m, gs, P, 3 * s0 + 1e-6, Q) < b0)
    lines = [f"== brute force vs closed form, S = TU stake of milestone 33: {n} instances, g_i ~ U(0,1), p={P}, q={Q}; max |difference| = {worst:.2e}",
             f"== bond infinite at 0.9 x stake (workers alone deviate): {inf_below} of {below_n} instances",
             f"== q = p: bond above 1e-6 in {q_eq_p_bad} of {qp_n} instances",
             f"== bond at 3 x stake not below bond at the stake: {s3_bad} of {s3_n} instances with positive bond and positive stake",
             "== mean bond B* by brute force (S = TU stake of each m)", "m    mean B*"]
    for m in BF_M:
        lines.append(f"{m:<4} {np.mean(mean_bf[m]):.3f}")
    lines.append(f"== closed form, {DRAWS} draws per m, S = TU stake, mean B*")
    big = {}
    for m in CF_M:
        v = []
        for _ in range(DRAWS):
            gs = list(rng.uniform(0, 1, m))
            v.append(bond_closed(gs, stake_closed_het(gs, P, transfers=True), Q))
        big[m] = (float(np.mean(v)), float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5)))
        lines.append(f"{m:<4} {big[m][0]:.2f}  [{big[m][1]:.2f}, {big[m][2]:.2f}] (2.5/97.5 percentiles over draws)")
    lines.append("== ratio of mean B* at m=7 to m=1 (closed form): %.2f (refutation bar: under 1.5)" % (big[7][0] / big[1][0]))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"worst": worst, "inf_below": [inf_below, below_n], "q_eq_p_bad": [q_eq_p_bad, qp_n],
               "s3_bad": [s3_bad, s3_n], "mean_bf": {m: float(np.mean(v)) for m, v in mean_bf.items()},
               "closed": big}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
