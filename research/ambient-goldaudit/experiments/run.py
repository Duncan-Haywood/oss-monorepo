"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/gold.png)"""
import numpy as np
from ambient_goldaudit.sim import Params, contexts
from ambient_goldaudit.est import (PRIOR, confusion, draw_audits, estimate_goldonly, estimate_noisyasgold,
                                   estimate_pooled_naive, estimate_joint, u_table, modes_from_estimate,
                                   value, blind_value)

P = Params()
CTX = contexts()
U = [u_table(P, c) for c in CTX]
AUD_ACC = 0.8          # true auditor accuracy; no estimator is told it
LABEL_ACCS = (0.7, 0.9)
GOLDS = (0, 10, 25, 50, 100, 200)
NOISY = (0, 200, 1000)
REPS = 150
NAMES = ("gold_only", "noisy_naive", "pooled_naive", "joint_em")


def score(C, est):
    """Mean true utility over contexts of the Bayes map built from est=(prior, C_hat)."""
    return float(np.mean([value(u, modes_from_estimate(u, *est), C, PRIOR) for u in U]))


print(f"Mean utility per message over {len(CTX)} contexts; true auditor accuracy {AUD_ACC} (never given to an estimator); "
      f"true mix 0.5/0.35/0.15; {REPS} audit sets per cell")
print("gold_only = Bayes rule from the G gold audits (smoothing 1); noisy_naive = N noisy audits read as truth; "
      "pooled_naive = both pooled as truth; joint_em = EM over (mix, label matrix, auditor matrix), gold rows pin the label matrix\n")
res = {}
for la in LABEL_ACCS:
    C = confusion(la); A = confusion(AUD_ACC)
    ref_true = float(np.mean([value(u, modes_from_estimate(u, PRIOR, C), C, PRIOR) for u in U]))
    ref_blind = float(np.mean([blind_value(u, PRIOR) for u in U]))
    print(f"== label accuracy {la}: true-parameter Bayes {ref_true:.4f}  blind {ref_blind:.4f}  (gain over blind {ref_true - ref_blind:.4f})")
    print("    G      N   " + "  ".join(f"{n:>17s}" for n in NAMES))
    for g in GOLDS:
        for n in NOISY:
            if g == 0 and n == 0:
                continue
            rng = np.random.default_rng(1000 * g + n + int(100 * la))
            sc = {k: [] for k in NAMES}
            for _ in range(REPS):
                gold, noisy = draw_audits(C, A, PRIOR, g, n, rng)
                if g > 0:
                    sc["gold_only"].append(score(C, estimate_goldonly(gold)))
                if n > 0:
                    sc["noisy_naive"].append(score(C, estimate_noisyasgold(noisy)))
                if g > 0 and n > 0:
                    sc["pooled_naive"].append(score(C, estimate_pooled_naive(gold, noisy)))
                    p_, c_, _a = estimate_joint(gold, noisy)
                    sc["joint_em"].append(score(C, (p_, c_)))
            cells = []
            for k in NAMES:
                if sc[k]:
                    m, s = np.mean(sc[k]), np.std(sc[k]); res[(la, g, n, k)] = m
                    cells.append(f"{m:.4f} ({s:.4f})")
                else:
                    cells.append("-")
            print(f"  {g:4d} {n:6d}   " + "  ".join(f"{c:>17s}" for c in cells))
    # gold-equivalent: smallest G whose gold-only mean reaches the noisy-naive mean at each N
    for n in NOISY[1:]:
        t = res[(la, 0, n, "noisy_naive")]
        ge = [g for g in GOLDS if g > 0 and res[(la, g, 0, "gold_only")] >= t]
        print(f"  -> {n} noisy audits read as truth ({t:.4f}) are matched by {'G = ' + str(ge[0]) + ' gold audits' if ge else 'more than ' + str(GOLDS[-1]) + ' gold audits'}")
    print()

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, len(LABEL_ACCS), figsize=(9, 3.4))
    for ax, la in zip(axs, LABEL_ACCS):
        gs = [g for g in GOLDS if g > 0]
        ax.plot(gs, [res[(la, g, 0, "gold_only")] for g in gs], "o-", color="k", label="gold only")
        for n, st in zip(NOISY[1:], ("--", ":")):
            ax.plot(gs, [res[(la, g, n, "joint_em")] for g in gs], "s" + st, color="C2", label=f"gold + {n} noisy, joint EM")
            ax.plot(gs, [res[(la, g, n, "pooled_naive")] for g in gs], "^" + st, color="C3", label=f"gold + {n} noisy, pooled naive")
            ax.axhline(res[(la, 0, n, "noisy_naive")], color="C7", ls=st, lw=1, label=f"{n} noisy only, read as truth")
        ax.set_xscale("log"); ax.set_xlabel("gold audits G"); ax.set_title(f"label accuracy {la}, auditor {AUD_ACC}", fontsize=9)
    axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
    fig.suptitle("Stylised model: gold audits versus noisy audits of unknown accuracy", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/gold.png", dpi=110)
except ImportError:
    pass
