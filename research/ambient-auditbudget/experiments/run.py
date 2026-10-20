"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/budget.png)"""
import numpy as np
from ambient_auditbudget.sim import Params, contexts
from ambient_auditbudget.est import (PRIOR, confusion, draw_audits, estimate_goldonly, estimate_noisyasgold,
                                     estimate_joint, u_table, modes_from_estimate, value, blind_value)

P = Params()
CTX = contexts()
U = [u_table(P, c) for c in CTX]
AUD_ACC = 0.8
LABEL_ACCS = (0.7, 0.9)
BUDGETS = (200, 1000)            # in units of one noisy audit
GOLD_COSTS = (3, 10, 30)         # cost of one gold audit in noisy-audit units
FRACS = (0.0, 0.1, 0.25, 0.5, 0.75, 1.0)   # share of the budget spent on gold audits
REPS = 100


def score(C, est):
    return float(np.mean([value(u, modes_from_estimate(u, *est), C, PRIOR) for u in U]))


def split(B, c, f):
    """G gold audits cost c each; the rest of the budget buys noisy audits at 1 each."""
    G = int(f * B // c)
    return G, int(B - c * G)


print(f"Mean utility per message over {len(CTX)} contexts; true auditor accuracy {AUD_ACC} (never given to an estimator); "
      f"true mix 0.5/0.35/0.15; {REPS} audit sets per cell")
print("Budget B is in noisy-audit units; a gold audit costs c. frac = share of B spent on gold. G, N = audits bought.")
print("split = the estimator that fits the audits bought: noisy_naive if G = 0, gold_only if N = 0, joint_em otherwise.")
print("gold_only_G = the same G gold audits with the noisy ones discarded.\n")
res = {}
for la in LABEL_ACCS:
    C = confusion(la); A = confusion(AUD_ACC)
    ref_true = float(np.mean([value(u, modes_from_estimate(u, PRIOR, C), C, PRIOR) for u in U]))
    ref_blind = float(np.mean([blind_value(u, PRIOR) for u in U]))
    print(f"== label accuracy {la}: true-parameter Bayes {ref_true:.4f}  blind {ref_blind:.4f}  (gain over blind {ref_true - ref_blind:.4f})")
    for B in BUDGETS:
        for c in GOLD_COSTS:
            print(f"  -- B = {B}, gold costs {c}")
            print("     frac      G      N           split   gold_only_G")
            for f in FRACS:
                G, N = split(B, c, f)
                rng = np.random.default_rng(7 * B + 13 * c + int(100 * f) + int(1000 * la))
                a, b = [], []
                for _ in range(REPS):
                    gold, noisy = draw_audits(C, A, PRIOR, G, N, rng)
                    if G == 0:
                        a.append(score(C, estimate_noisyasgold(noisy)))
                    elif N == 0:
                        a.append(score(C, estimate_goldonly(gold)))
                    else:
                        p_, c_, _a = estimate_joint(gold, noisy)
                        a.append(score(C, (p_, c_)))
                    if G > 0:
                        b.append(score(C, estimate_goldonly(gold)))
                res[(la, B, c, f)] = (np.mean(a), np.std(a), np.mean(b) if b else None, G, N)
                gcol = f"{np.mean(b):.4f}" if b else "-"
                print(f"     {f:4.2f} {G:6d} {N:6d}   {np.mean(a):.4f} ({np.std(a):.4f})   {gcol:>10s}")
            best = max(FRACS, key=lambda f: res[(la, B, c, f)][0])
            print(f"     -> best share of budget on gold: {best:.2f} (mean {res[(la, B, c, best)][0]:.4f}); "
                  f"all-noisy {res[(la, B, c, 0.0)][0]:.4f}; all-gold {res[(la, B, c, 1.0)][0]:.4f}")
    print()

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(len(LABEL_ACCS), len(BUDGETS), figsize=(8, 6), sharex=True)
    for i, la in enumerate(LABEL_ACCS):
        for j, B in enumerate(BUDGETS):
            ax = axs[i][j]
            for c, col in zip(GOLD_COSTS, ("C0", "C1", "C3")):
                ax.plot(FRACS, [res[(la, B, c, f)][0] for f in FRACS], "o-", color=col, label=f"gold costs {c}")
            ax.set_title(f"label acc {la}, budget {B}", fontsize=9)
            if i == len(LABEL_ACCS) - 1:
                ax.set_xlabel("share of budget spent on gold audits")
            if j == 0:
                ax.set_ylabel("mean utility per message")
    axs[0][0].legend(fontsize=7)
    fig.suptitle("Stylised model: splitting a fixed audit budget", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/budget.png", dpi=110)
except ImportError:
    pass
