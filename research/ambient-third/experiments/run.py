"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/third.png)"""
import numpy as np
from ambient_third.sim import Params, contexts
from ambient_third.est import (PRIOR, confusion, joint3_hard, draw3_hard, estimate_naive, estimate_ds3,
                               estimate_ds3_hard, u_table, policies)

P = Params()
U = [u_table(P, c) for c in contexts()]
REPS = 40
AUD = 0.8
CELLS = [(0.1, 0.5), (0.2, 0.5), (0.3, 0.5), (0.2, 1 / 3), (0.3, 1 / 3)]   # (h, hard accuracy)


def v_of(C, pe, Ce):
    return float(np.mean([policies(u, C, PRIOR, pe, Ce, pe, Ce)["bayes_naive"] for u in U]))


def ref(C):
    r = [policies(u, C, PRIOR, PRIOR, C, PRIOR, C) for u in U]
    return float(np.mean([x["blind"] for x in r])), float(np.mean([x["bayes_true"] for x in r]))


print(f"Mean utility per message over {len(U)} contexts. THREE auditors, each of overall accuracy {AUD}; a fraction h of messages is hard for all three (accuracy hard_acc), the rest easy (accuracy chosen to keep the overall {AUD}).")
print("naive = auditor 1 taken as truth; ds3 = plain Dawid-Skene with 3 auditors; dsH3 = hardness-aware DS with 3 auditors (informed start)\n")
res = {}
for la in (0.7, 0.9):
    C = confusion(la)
    blind, best = ref(C)
    print(f"== label accuracy {la}: blind {blind:.4f}, true-parameter Bayes {best:.4f} (gain {best-blind:.4f})")
    print("   h  hard | population: naive ds3 dsH3 | ds3 est. auditor acc, dsH3 est. C acc, dsH3 est. P(hard) | n=200: naive ds3 dsH3 [P(ds3<blind) P(dsH3<blind)] | n=1000: naive ds3 dsH3")
    for h, ha in CELLS:
        J = joint3_hard(C, AUD, h, ha, PRIOR) * 1e9
        pn, Cn = estimate_naive(J.sum(axis=(1, 2)), 1.0)
        pd, Cd, As = estimate_ds3(J, iters=20000)
        pH, CH, _, _, phH, _ = estimate_ds3_hard(J, iters=20000)
        pop = (v_of(C, pn, Cn), v_of(C, pd, Cd), v_of(C, pH, CH))
        row = {"pop": pop}
        txt = []
        for n in (200, 1000):
            rng = np.random.default_rng(int(1e4 * la) + int(100 * h) + int(10 * ha) + n)
            r = []
            for _ in range(REPS):
                c3 = draw3_hard(C, AUD, h, ha, PRIOR, n, rng)
                a, b = estimate_naive(c3.sum(axis=(1, 2)), 1.0)
                d, dc, _ = estimate_ds3(c3, iters=2000, tol=1e-10)
                g, gc, _, _, _, _ = estimate_ds3_hard(c3, iters=2000, tol=1e-10)
                r.append([v_of(C, a, b), v_of(C, d, dc), v_of(C, g, gc)])
            r = np.array(r)
            row[n] = r.mean(axis=0)
            txt.append(" ".join(f"{x:.4f}" for x in r.mean(axis=0)) + (f" [{np.mean(r[:,1] < blind-1e-12):.2f} {np.mean(r[:,2] < blind-1e-12):.2f}]" if n == 200 else ""))
        res[(la, h, ha)] = row
        print(f"  {h:.1f} {ha:.2f} | " + " ".join(f"{x:.4f}" for x in pop) + f" | {np.mean([np.diag(A).mean() for A in As]):.3f} {np.diag(CH).mean():.3f} {phH:.3f} | " + " | ".join(txt))
    print()

print("Hardness share with three auditors (population fit of the hardness-aware model, label accuracy 0.7, h=0.3, hard_acc=0.5), several starts:")
J = joint3_hard(confusion(0.7), AUD, 0.3, 0.5, PRIOR) * 1e9
for init in ((0.9, 0.5, 0.3, 0.7), (0.95, 0.4, 0.2, 0.7), (0.85, 0.6, 0.4, 0.7), (0.99, 0.34, 0.1, 0.8), (0.8, 0.8, 0.5, 0.6)):
    pr, Ch, Ae, Ah, ph, ll = estimate_ds3_hard(J, iters=40000, init=init)
    print(f"  start easy/hard/P(hard)/C = {init}: P(hard) {ph:.3f}, easy acc {np.diag(Ae).mean():.3f}, hard acc {np.diag(Ah).mean():.3f}, C acc {np.diag(Ch).mean():.3f}, loglik/n {ll:.6f}")
print("Same, finite samples (20 draws each, start (0.9,0.5,0.3,0.7)): estimated P(hard)")
rng = np.random.default_rng(7)
for n in (1000, 5000):
    ests = [estimate_ds3_hard(draw3_hard(confusion(0.7), AUD, 0.3, 0.5, PRIOR, n, rng), iters=3000, tol=1e-10)[4] for _ in range(20)]
    print(f"  n={n}: mean {np.mean(ests):.3f}, sd {np.std(ests):.3f}, min {min(ests):.3f}, max {max(ests):.3f} (truth 0.300)")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
xs = np.arange(len(CELLS))
for ax, la in zip(axs, (0.7, 0.9)):
    blind, best = ref(confusion(la))
    for i, lab in enumerate(("naive", "plain DS, 3 auditors", "hardness-aware DS, 3 auditors")):
        ax.plot(xs, [res[(la, h, ha)]["pop"][i] for h, ha in CELLS], "o-", color=f"C{i}", label=lab)
    ax.axhline(best, color="k", ls=":", lw=1, label="true-parameter Bayes"); ax.axhline(blind, color="gray", ls="--", lw=1, label="blind")
    ax.set_xticks(xs); ax.set_xticklabels([f"h={h}\nhard={ha:.2f}" for h, ha in CELLS], fontsize=6)
    ax.set_title(f"population limit, label accuracy {la}", fontsize=9)
axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
fig.suptitle("Stylised model: three auditors who share hard messages", fontsize=9)
fig.tight_layout(); fig.savefig("experiments/third.png", dpi=110)
