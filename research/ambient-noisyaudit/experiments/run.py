"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/audit.png)"""
import numpy as np
from ambient_noisyaudit.sim import Params, contexts
from ambient_noisyaudit.est import (PRIOR, confusion, joint_audit, draw_audit, estimate_naive,
                                    estimate_em, u_table, policies)

P = Params()
CTX = contexts()
U = [u_table(P, c) for c in CTX]
LABEL_ACCS = (0.7, 0.9)
AUD_ACCS = (1.0, 0.9, 0.8, 0.7)
NS = (50, 200, 1000)
REPS = 200
ALPHA = 1.0


def score(C, pn, Cn, pe, Ce):
    v = [policies(u, C, PRIOR, pn, Cn, pe, Ce) for u in U]
    return {k: float(np.mean([x[k] for x in v])) for k in v[0]}


print(f"Mean utility per message over {len(CTX)} contexts; uniform-error label and auditor; true mix 0.5/0.35/0.15")
print(f"'naive' = auditor label taken as truth, smoothing alpha={ALPHA:g}; 'em' = maximum likelihood with the auditor's matrix known; {REPS} audit sets per finite cell\n")
res = {}
for la in LABEL_ACCS:
    C = confusion(la)
    for aa in AUD_ACCS:
        A = confusion(aa)
        J = joint_audit(C, A, PRIOR)
        pn, Cn = estimate_naive(J, 0.0)
        pe, Ce = estimate_em(J * 1e9, A, iters=5000)
        pop = score(C, pn, Cn, pe, Ce)
        print(f"== label accuracy {la}, auditor accuracy {aa}: true-param Bayes {pop['bayes_true']:.4f}  blind {pop['blind']:.4f}")
        print(f"   population limit (n = infinity): naive {pop['bayes_naive']:.4f}  em {pop['bayes_em']:.4f}; "
              f"naive-implied label accuracy {np.diag(Cn).mean():.3f} (true {la}), implied P(high) {pn[2]:.3f} (true {PRIOR[2]:.3f})")
        print("      n    naive mean (std)   em mean (std)   P(naive<blind)  P(em<blind)")
        for n in NS:
            rng = np.random.default_rng(int(1e5 * la) + int(1e3 * aa) + n)
            rows = []
            for _ in range(REPS):
                c = draw_audit(C, A, PRIOR, n, rng)
                a, b = estimate_naive(c, ALPHA)
                d, e = estimate_em(c, A)
                rows.append(score(C, a, b, d, e))
            nv = np.array([r['bayes_naive'] for r in rows]); em = np.array([r['bayes_em'] for r in rows])
            bl = rows[0]['blind']
            res[(la, aa, n)] = (nv.mean(), em.mean())
            print(f"   {n:5d}   {nv.mean():.4f} ({nv.std():.4f})   {em.mean():.4f} ({em.std():.4f})     "
                  f"{np.mean(nv < bl - 1e-12):5.2f}          {np.mean(em < bl - 1e-12):5.2f}")
        res[(la, aa, 'pop')] = (pop['bayes_naive'], pop['bayes_em'], pop['bayes_true'], pop['blind'])
        print()

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, len(LABEL_ACCS), figsize=(9, 3.4))
    for ax, la in zip(axs, LABEL_ACCS):
        x = np.array(AUD_ACCS)
        for n, st in zip(NS, ("0.75", "0.5", "0.0")):
            ax.plot(x, [res[(la, aa, n)][0] for aa in AUD_ACCS], "o--", color=st, lw=1, label=f"naive, n={n}")
        ax.plot(x, [res[(la, aa, 1000)][1] for aa in AUD_ACCS], "s-", color="C2", label="EM (auditor known), n=1000")
        ax.plot(x, [res[(la, aa, 'pop')][0] for aa in AUD_ACCS], "^:", color="C3", label="naive, n=infinity")
        ax.axhline(res[(la, 1.0, 'pop')][2], color="k", ls=":", lw=1, label="true-parameter Bayes")
        ax.axhline(res[(la, 1.0, 'pop')][3], color="C7", ls="--", lw=1, label="blind")
        ax.set_title(f"label accuracy {la}", fontsize=9); ax.set_xlabel("auditor accuracy"); ax.invert_xaxis()
    axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6)
    fig.suptitle("Stylised model: Bayes policy trained on audits whose labels are themselves noisy", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/audit.png", dpi=110)
except ImportError:
    pass
