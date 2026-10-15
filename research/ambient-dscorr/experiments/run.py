"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/dscorr.png)"""
import numpy as np
from ambient_dscorr.sim import Params, contexts
from ambient_dscorr.est import (PRIOR, confusion, joint_audit2_corr, draw_audit2_corr, estimate_naive,
                                estimate_em, estimate_ds, u_table, policies)

P = Params()
U = [u_table(P, c) for c in contexts()]
REPS = 100
RHOS = (0.0, 0.25, 0.5, 0.75, 1.0)
AUD = 0.8


def v_of(C, pe, Ce):
    """Mean utility over contexts of the Bayes policy built from the estimate (pe, Ce), scored under the truth."""
    return float(np.mean([policies(u, C, PRIOR, pe, Ce, pe, Ce)["bayes_naive"] for u in U]))


def ref(C):
    r = [policies(u, C, PRIOR, PRIOR, C, PRIOR, C) for u in U]
    return float(np.mean([x["blind"] for x in r])), float(np.mean([x["bayes_true"] for x in r]))


print(f"Mean utility per message over {len(U)} contexts. Two auditors, each of marginal accuracy {AUD}; with probability rho auditor 2 copies auditor 1's label.")
print("naive = auditor 1 taken as truth (alpha=1); em-known = EM with auditor 1's accuracy supplied (oracle, ignores auditor 2); ds = Dawid-Skene on both auditors\n")
res = {}
for la in (0.7, 0.9):
    C, A = confusion(la), confusion(AUD)
    blind, best = ref(C)
    print(f"== label accuracy {la}: blind {blind:.4f}, true-parameter Bayes {best:.4f} (gain {best-blind:.4f})")
    print("  rho  | population: naive  em-known   ds  | ds est. auditor acc (pop) | n=200: naive em-known ds [P(ds<blind)] | n=1000: naive em-known ds")
    for rho in RHOS:
        J = joint_audit2_corr(C, A, A, PRIOR, rho) * 1e9
        pn, Cn = estimate_naive(J.sum(axis=1), 1.0)
        pk, Ck = estimate_em(J.sum(axis=1), A, iters=5000)
        pd, Cd, A1h, A2h = estimate_ds(J, iters=20000)
        pop = (v_of(C, pn, Cn), v_of(C, pk, Ck), v_of(C, pd, Cd))
        row = {"pop": pop, "accest": float(np.mean(np.diag(A1h)))}
        txt = []
        for n in (200, 1000):
            rng = np.random.default_rng(int(1e4 * la) + int(100 * rho) + n)
            r = []
            for _ in range(REPS):
                c2 = draw_audit2_corr(C, A, A, PRIOR, rho, n, rng)
                a, b = estimate_naive(c2.sum(axis=1), 1.0)
                k, kc = estimate_em(c2.sum(axis=1), A)
                d, dc, _, _ = estimate_ds(c2, iters=2000, tol=1e-10)
                r.append([v_of(C, a, b), v_of(C, k, kc), v_of(C, d, dc)])
            r = np.array(r); row[n] = r.mean(axis=0); row[(n, "below")] = float(np.mean(r[:, 2] < blind - 1e-12))
            txt.append(f"{r[:,0].mean():.4f} {r[:,1].mean():.4f} {r[:,2].mean():.4f}" + (f" [{row[(n,'below')]:.2f}]" if n == 200 else ""))
        res[(la, rho)] = row
        print(f"  {rho:4.2f} | {pop[0]:.4f} {pop[1]:.4f} {pop[2]:.4f} | {row['accest']:.3f} | " + " | ".join(txt))
    print()

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(9, 3.4), sharey=False)
for ax, la in zip(axs, (0.7, 0.9)):
    blind, best = ref(confusion(la))
    for i, (nm, lab) in enumerate((("naive", "naive"), ("em-known", "em-known (oracle accuracy)"), ("ds", "Dawid-Skene"))):
        ax.plot(RHOS, [res[(la, r)]["pop"][i] for r in RHOS], "o-", color=f"C{i}", label=lab)
    ax.axhline(best, color="k", ls=":", lw=1, label="true-parameter Bayes"); ax.axhline(blind, color="gray", ls="--", lw=1, label="blind")
    ax.set_xlabel("rho: P(auditor 2 copies auditor 1)"); ax.set_title(f"population limit, label accuracy {la}", fontsize=9)
axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
fig.suptitle("Stylised model: Dawid-Skene with shared auditor errors", fontsize=9)
fig.tight_layout(); fig.savefig("experiments/dscorr.png", dpi=110)
