"""Sensitivity to the EM start: PYTHONPATH=src python3 experiments/start.py > experiments/start.txt
The main grid starts EM at the true auditor accuracy (0.8). Here the start is 0.5 or 0.95 instead."""
import numpy as np
from ambient_auditbudget.sim import Params, contexts
from ambient_auditbudget.est import (PRIOR, confusion, draw_audits, estimate_joint, u_table,
                                     modes_from_estimate, value)

P = Params(); CTX = contexts(); U = [u_table(P, c) for c in CTX]
A = confusion(0.8); REPS = 100
def score(C, est):
    return float(np.mean([value(u, modes_from_estimate(u, *est), C, PRIOR) for u in U]))
print("Mean utility per message; true auditor accuracy 0.8; budget 1000 noisy units; EM start accuracy a0 varies; 100 audit sets per cell")
print("   label   gold_cost   G      N      a0=0.50   a0=0.80   a0=0.95")
for la in (0.7, 0.9):
    C = confusion(la)
    for c, G in ((10, 10), (30, 3), (30, 1)):
        N = 1000 - c * G
        row = []
        for a0 in (0.5, 0.8, 0.95):
            rng = np.random.default_rng(5000 + int(100 * la) + c + G)   # same audit sets for every start
            v = []
            for _ in range(REPS):
                gold, noisy = draw_audits(C, A, PRIOR, G, N, rng)
                p_, c_, _ = estimate_joint(gold, noisy, a0=a0)
                v.append(score(C, (p_, c_)))
            row.append(np.mean(v))
        print(f"   {la:4.1f}   {c:8d} {G:4d} {N:6d}   " + "   ".join(f"{x:.4f}" for x in row))
