"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/audit.png)"""
import numpy as np
from ambient_confest.sim import Params, contexts
from ambient_confest.est import PRIOR, confusion, audit, policies, u_table

P = Params()
CTX = contexts()
U = [u_table(P, c) for c in CTX]
NS = (10, 20, 50, 100, 200, 500, 1000, 5000)
ACCS = (0.5, 0.7, 0.9)
REPS = 300


def mean_over_ctx(C, counts, alpha):
    v = [policies(u, C, PRIOR, counts, alpha) for u in U]
    return {k: float(np.mean([x[k] for x in v])) for k in v[0]}


def sweep(acc, n, alpha, seed):
    rng = np.random.default_rng(seed)
    C = confusion(acc)
    rows = [mean_over_ctx(C, audit(C, PRIOR, n, rng), alpha) for _ in range(REPS)]
    return rows


print(f"Mean utility per message over {len(CTX)} contexts; {REPS} audit sets per cell; uniform-error label; true prior 0.5/0.35/0.15")
res = {}
for acc in ACCS:
    C = confusion(acc)
    ref = mean_over_ctx(C, np.zeros((3, 3)), 1.0)  # bayes_hat unused here
    print(f"\n== label accuracy {acc}: oracle {ref['oracle']:.4f}  bayes(true params) {ref['bayes_true']:.4f}  naive {ref['naive']:.4f}  blind {ref['blind']:.4f}")
    print("   alpha   n   bayes_hat mean (std)   P(hat<blind)  P(hat<naive)  gain share*")
    gain = ref['bayes_true'] - ref['blind']
    for alpha in (0.0, 1.0):
        for n in NS:
            rows = sweep(acc, n, alpha, seed=int(1000 * acc) + n)
            h = np.array([r['bayes_hat'] for r in rows])
            res[(acc, alpha, n)] = h.mean()
            lb = np.mean([r['bayes_hat'] < r['blind'] - 1e-12 for r in rows])
            ln = np.mean([r['bayes_hat'] < r['naive'] - 1e-12 for r in rows])
            share = (h.mean() - ref['blind']) / gain if abs(gain) > 1e-9 else float('nan')
            print(f"   {alpha:4.1f} {n:5d}   {h.mean():.4f} ({h.std():.4f})      {lb:6.2f}        {ln:6.2f}      {share:+.2f}")
    print("   *share of the (bayes with true parameters) minus blind gain recovered, mean over audit sets")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, len(ACCS), figsize=(10, 3.2), sharey=False)
    for ax, acc in zip(axs, ACCS):
        C = confusion(acc)
        ref = mean_over_ctx(C, np.zeros((3, 3)), 1.0)  # bayes_hat unused here
        for alpha, st in ((0.0, "C0o-"), (1.0, "C1s-")):
            ax.plot(NS, [res[(acc, alpha, n)] for n in NS], st, label=f"estimated, alpha={alpha:g}")
        for k, st in (("bayes_true", "k:"), ("naive", "C3--"), ("blind", "C7--")):
            ax.axhline(ref[k], color=st[:2] if st[0] == "C" else "k", ls=st[-2:] if st.endswith("--") else ":", lw=1, label=k)
        ax.set_xscale("log"); ax.set_title(f"label accuracy {acc}", fontsize=9); ax.set_xlabel("audit set size n")
    axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
    fig.suptitle("Stylised model: Bayes policy with prior and confusion matrix estimated from n audited messages", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/audit.png", dpi=110)
except ImportError:
    pass
