"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/startcount.png)"""
import numpy as np
from ambient_startcount.sim import Params, contexts
from ambient_startcount.est import (PRIOR, confusion, joint3_hard, draw3_hard, u_table, policies,
                                    NESTED_GRID, KS, random_starts, fit_all, best_of_first)

P = Params()
U = [u_table(P, c) for c in contexts()]
REPS = 40
AUD, LA = 0.8, 0.7
CELLS = [(0.0, 0.5), (0.3, 0.5), (0.3, 1 / 3)]   # (h, hard accuracy); h = 0 is the null
C = confusion(LA)
HIT = 1e-7   # a fit "reaches the best optimum" if its per-message log-likelihood is within this of the best of all 32 fits


def v_of(pe, Ce):
    return float(np.mean([policies(u, C, PRIOR, pe, Ce, pe, Ce)["bayes_naive"] for u in U]))


r = [policies(u, C, PRIOR, PRIOR, C, PRIOR, C) for u in U]
BLIND, BEST = float(np.mean([x["blind"] for x in r])), float(np.mean([x["bayes_true"] for x in r]))
print(f"Label accuracy {LA}, three auditors of overall accuracy {AUD}. Blind {BLIND:.4f}, true-parameter Bayes {BEST:.4f}.")
print(f"Per draw: 16 nested grid starts and 16 random starts (easy U(0.7,1), hard U(0.3,0.7), P(hard) U(0.05,0.5), classifier 0.7), each fitted once; a K-start strategy keeps the best log-likelihood among its first K.")
print(f"'hit' = best fit's log-likelihood within {HIT:g} per message of the best of all 32 fits. Compute = K fits (same iteration cap 2000, tol 1e-10 for all).\n")

res = {}
for h, ha in CELLS:
    print(f"== h={h:.1f} hard accuracy {ha:.2f}")
    print("   n | strategy K: hit share, mean loglik gap (x1e-6), mean P(hard) (sd), degenerate share (P(hard)>0.45 or <0.02), mean utility")
    for n in (200, 1000):
        rng = np.random.default_rng(int(1e4 * h) + int(10 * ha) + n)
        stats = {(s, k): dict(hit=[], gap=[], ph=[], ut=[]) for s in ("grid", "random") for k in KS}
        for _ in range(REPS):
            c = draw3_hard(C, AUD, h, ha, PRIOR, n, rng)
            fits = {"grid": fit_all(c, NESTED_GRID), "random": fit_all(c, random_starts(rng, 16))}
            ref = max(f[5] for fs in fits.values() for f in fs)
            for (s, k), d in stats.items():
                f = best_of_first(fits[s], k)
                d["hit"].append(ref - f[5] < HIT); d["gap"].append(ref - f[5]); d["ph"].append(f[4]); d["ut"].append(v_of(f[0], f[1]))
        for (s, k), d in stats.items():
            ph = np.array(d["ph"])
            deg = float(np.mean((ph > 0.45) | (ph < 0.02)))
            res[(h, ha, n, s, k)] = (np.mean(d["hit"]), np.mean(d["gap"]), ph.mean(), ph.std(), deg, np.mean(d["ut"]))
            print(f"  {n:5d} | {s:6s} K={k:2d}: hit {np.mean(d['hit']):.2f}, gap {1e6 * np.mean(d['gap']):9.2f}, P(hard) {ph.mean():.3f} ({ph.std():.3f}), degenerate {deg:.2f}, utility {np.mean(d['ut']):.4f}")
    print()

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
for (h, ha), ls in zip(CELLS[1:], ("-", "--")):
    for s, col in (("grid", "C0"), ("random", "C1")):
        axs[0].plot(KS, [res[(h, ha, 1000, s, k)][0] for k in KS], "o" + ls, color=col, label=f"{s}, hard={ha:.2f}")
        axs[1].plot(KS, [res[(h, ha, 1000, s, k)][5] for k in KS], "o" + ls, color=col, label=f"{s}, hard={ha:.2f}")
axs[0].set_ylabel("share of draws reaching the best optimum"); axs[1].set_ylabel("mean utility per message")
axs[1].axhline(BEST, color="k", ls=":", lw=1, label="true-parameter Bayes")
for ax in axs:
    ax.set_xscale("log", base=2); ax.set_xticks(KS); ax.set_xticklabels(KS); ax.set_xlabel("starts K (fits)")
axs[0].legend(fontsize=6)
fig.suptitle("Stylised model: hardness-aware DS, h=0.3, n=1000, by number of starts (label accuracy 0.7)", fontsize=9)
fig.tight_layout(); fig.savefig("experiments/startcount.png", dpi=110)
