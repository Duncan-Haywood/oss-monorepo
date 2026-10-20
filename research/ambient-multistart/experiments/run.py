"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/multistart.png)"""
import numpy as np
from ambient_multistart.sim import Params, contexts
from ambient_multistart.est import (PRIOR, confusion, joint3_hard, draw3_hard, estimate_ds3_hard,
                                    estimate_ds3_hard_multistart, estimate_naive, u_table, policies, START_GRID)

P = Params()
U = [u_table(P, c) for c in contexts()]
REPS = 40
AUD = 0.8
LA = 0.7
INFORMED, POOR = (0.9, 0.5, 0.3, 0.7), (0.8, 0.8, 0.5, 0.6)
CELLS = [(0.0, 0.5), (0.3, 0.5), (0.3, 1 / 3)]   # (h, hard accuracy); h = 0 is the null: no hardness at all
C = confusion(LA)


def v_of(pe, Ce):
    return float(np.mean([policies(u, C, PRIOR, pe, Ce, pe, Ce)["bayes_naive"] for u in U]))


r = [policies(u, C, PRIOR, PRIOR, C, PRIOR, C) for u in U]
BLIND, BEST = float(np.mean([x["blind"] for x in r])), float(np.mean([x["bayes_true"] for x in r]))
print(f"Label accuracy {LA}, three auditors of overall accuracy {AUD}. Blind {BLIND:.4f}, true-parameter Bayes {BEST:.4f}.")
print(f"Single informed start {INFORMED}; single poor start {POOR} (no easy/hard difference); multistart = best log-likelihood over {len(START_GRID)} grid starts {START_GRID[0]}...{START_GRID[-1]} (none is the truth).\n")

print("Population (counts = exact joint x 1e9): P(hard) estimate, loglik/n")
for h, ha in CELLS:
    J = joint3_hard(C, AUD, h, ha, PRIOR) * 1e9
    out = []
    for name, f in (("informed", lambda: estimate_ds3_hard(J, iters=40000, init=INFORMED)),
                    ("poor", lambda: estimate_ds3_hard(J, iters=40000, init=POOR)),
                    ("multistart", lambda: estimate_ds3_hard_multistart(J, iters=40000, tol=1e-12))):
        fit = f()
        out.append(f"{name} {fit[4]:.3f} ({fit[5]:.6f})")
    print(f"  h={h:.1f} hard={ha:.2f}: " + "; ".join(out))
print()

res = {}
for h, ha in CELLS:
    print(f"== h={h:.1f} hard accuracy {ha:.2f}")
    print("   n | method: mean P(hard) (sd), mean |C-acc error|, mean utility, share of draws with utility < blind, share of draws where fit is degenerate (P(hard)>0.45 or <0.02)")
    for n in (200, 1000):
        rng = np.random.default_rng(int(1e4 * h) + int(10 * ha) + n)
        draws = [draw3_hard(C, AUD, h, ha, PRIOR, n, rng) for _ in range(REPS)]
        rows = {}
        for name, f in (("informed", lambda c: estimate_ds3_hard(c, iters=2000, tol=1e-10, init=INFORMED)),
                        ("poor", lambda c: estimate_ds3_hard(c, iters=2000, tol=1e-10, init=POOR)),
                        ("multistart", lambda c: estimate_ds3_hard_multistart(c, iters=2000, tol=1e-10))):
            ph, cerr, ut = [], [], []
            for c in draws:
                fit = f(c)
                ph.append(fit[4]); cerr.append(abs(np.diag(fit[1]).mean() - LA)); ut.append(v_of(fit[0], fit[1]))
            ph, cerr, ut = map(np.array, (ph, cerr, ut))
            deg = np.mean((ph > 0.45) | (ph < 0.02))
            rows[name] = (ph.mean(), ph.std(), cerr.mean(), ut.mean(), np.mean(ut < BLIND - 1e-12), deg)
            print(f"  {n:5d} | {name:10s}: P(hard) {ph.mean():.3f} ({ph.std():.3f}), C err {cerr.mean():.4f}, utility {ut.mean():.4f}, <blind {np.mean(ut < BLIND - 1e-12):.2f}, degenerate {deg:.2f}")
        res[(h, ha, n)] = rows
    print()

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
labels = [f"h={h}\nhard={ha:.2f}\nn={n}" for h, ha in CELLS for n in (200, 1000)]
keys = [(h, ha, n) for h, ha in CELLS for n in (200, 1000)]
xs = np.arange(len(keys))
for i, name in enumerate(("informed", "poor", "multistart")):
    axs[0].plot(xs, [res[k][name][3] for k in keys], "o-", color=f"C{i}", label=f"{name} start")
    axs[1].plot(xs, [res[k][name][5] for k in keys], "o-", color=f"C{i}", label=f"{name} start")
axs[0].axhline(BEST, color="k", ls=":", lw=1, label="true-parameter Bayes"); axs[0].axhline(BLIND, color="gray", ls="--", lw=1, label="blind")
axs[0].set_ylabel("mean utility per message"); axs[1].set_ylabel("share of degenerate fits")
for ax in axs:
    ax.set_xticks(xs); ax.set_xticklabels(labels, fontsize=5)
axs[0].legend(fontsize=6)
fig.suptitle("Stylised model: hardness-aware DS, three auditors, by start strategy (label accuracy 0.7)", fontsize=9)
fig.tight_layout(); fig.savefig("experiments/multistart.png", dpi=110)
