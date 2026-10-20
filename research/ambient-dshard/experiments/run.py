"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/dshard.png)"""
import numpy as np
from ambient_dshard.sim import Params, contexts
from ambient_dshard.est import (PRIOR, confusion, easy_accuracy, joint_audit2_hard, draw_audit2_hard, estimate_naive,
                                estimate_em, estimate_ds, estimate_ds_hard, u_table, policies)

P = Params()
U = [u_table(P, c) for c in contexts()]
REPS = 60
AUD = 0.8
CELLS = [(0.1, 0.5), (0.2, 0.5), (0.3, 0.5), (0.2, 1 / 3), (0.3, 1 / 3)]   # (h, hard accuracy)


def v_of(C, pe, Ce):
    return float(np.mean([policies(u, C, PRIOR, pe, Ce, pe, Ce)["bayes_naive"] for u in U]))


def ref(C):
    r = [policies(u, C, PRIOR, PRIOR, C, PRIOR, C) for u in U]
    return float(np.mean([x["blind"] for x in r])), float(np.mean([x["bayes_true"] for x in r]))


print(f"Mean utility per message over {len(U)} contexts. Two auditors, each of overall accuracy {AUD}; a fraction h of messages is hard for both (accuracy hard_acc), the rest easy (accuracy chosen to keep the overall {AUD}).")
print("naive = auditor 1 taken as truth; em-known = EM with auditor 1's overall matrix supplied (oracle, ignores auditor 2); ds = plain Dawid-Skene; dsH = hardness-aware Dawid-Skene (informed start)\n")
res = {}
for la in (0.7, 0.9):
    C, A = confusion(la), confusion(AUD)
    blind, best = ref(C)
    print(f"== label accuracy {la}: blind {blind:.4f}, true-parameter Bayes {best:.4f} (gain {best-blind:.4f})")
    print("   h  hard | population: naive em-known ds dsH | ds est. auditor acc, dsH est. C acc | n=200: naive em-known ds dsH [P(ds<blind) P(dsH<blind)] | n=1000: naive em-known ds dsH")
    for h, ha in CELLS:
        J = joint_audit2_hard(C, AUD, h, ha, PRIOR) * 1e9
        pn, Cn = estimate_naive(J.sum(axis=1), 1.0)
        pk, Ck = estimate_em(J.sum(axis=1), A, iters=5000)
        pd, Cd, A1h, _ = estimate_ds(J, iters=20000)
        pH, CH, _, _, phH = estimate_ds_hard(J, iters=20000)
        pop = (v_of(C, pn, Cn), v_of(C, pk, Ck), v_of(C, pd, Cd), v_of(C, pH, CH))
        row = {"pop": pop, "accest": float(np.mean(np.diag(A1h))), "Cacc": float(np.mean(np.diag(CH)))}
        txt = []
        for n in (200, 1000):
            rng = np.random.default_rng(int(1e4 * la) + int(100 * h) + int(10 * ha) + n)
            r = []
            for _ in range(REPS):
                c2 = draw_audit2_hard(C, AUD, h, ha, PRIOR, n, rng)
                a, b = estimate_naive(c2.sum(axis=1), 1.0)
                k, kc = estimate_em(c2.sum(axis=1), A)
                d, dc, _, _ = estimate_ds(c2, iters=2000, tol=1e-10)
                g, gc, _, _, _ = estimate_ds_hard(c2, iters=2000, tol=1e-10)
                r.append([v_of(C, a, b), v_of(C, k, kc), v_of(C, d, dc), v_of(C, g, gc)])
            r = np.array(r)
            row[n] = r.mean(axis=0)
            row[(n, "below")] = (float(np.mean(r[:, 2] < blind - 1e-12)), float(np.mean(r[:, 3] < blind - 1e-12)))
            txt.append(" ".join(f"{x:.4f}" for x in r.mean(axis=0)) + (f" [{row[(n,'below')][0]:.2f} {row[(n,'below')][1]:.2f}]" if n == 200 else ""))
        res[(la, h, ha)] = row
        print(f"  {h:.1f} {ha:.2f} | " + " ".join(f"{x:.4f}" for x in pop) + f" | {row['accest']:.3f} {row['Cacc']:.3f} | " + " | ".join(txt))
    print()

# non-identification of the hardness share, two different starts, population, h=0.3 hard_acc=0.5
print("Hardness share is not identified (population fit of the hardness-aware model, label accuracy 0.7, h=0.3, hard_acc=0.5):")
J = joint_audit2_hard(confusion(0.7), AUD, 0.3, 0.5, PRIOR) * 1e9
for init in ((0.9, 0.5, 0.3, 0.7), (0.95, 0.4, 0.2, 0.7), (0.85, 0.6, 0.4, 0.7)):
    pr, Ch, Ae, Ah, ph = estimate_ds_hard(J, iters=20000, init=init)
    print(f"  start easy/hard/P(hard)/C = {init}: P(hard) {ph:.3f}, easy acc {np.diag(Ae).mean():.3f}, hard acc {np.diag(Ah).mean():.3f}, C acc {np.diag(Ch).mean():.3f}, overall {(1-ph)*np.diag(Ae).mean()+ph*np.diag(Ah).mean():.3f}")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
xs = np.arange(len(CELLS))
for ax, la in zip(axs, (0.7, 0.9)):
    blind, best = ref(confusion(la))
    for i, lab in enumerate(("naive", "em-known (oracle)", "plain Dawid-Skene", "hardness-aware DS")):
        ax.plot(xs, [res[(la, h, ha)]["pop"][i] for h, ha in CELLS], "o-", color=f"C{i}", label=lab)
    ax.axhline(best, color="k", ls=":", lw=1, label="true-parameter Bayes"); ax.axhline(blind, color="gray", ls="--", lw=1, label="blind")
    ax.set_xticks(xs); ax.set_xticklabels([f"h={h}\nhard={ha:.2f}" for h, ha in CELLS], fontsize=6)
    ax.set_title(f"population limit, label accuracy {la}", fontsize=9)
axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
fig.suptitle("Stylised model: Dawid-Skene when some messages are hard for both auditors", fontsize=9)
fig.tight_layout(); fig.savefig("experiments/dshard.png", dpi=110)
