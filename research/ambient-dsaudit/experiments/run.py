"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt  (also writes experiments/dsaudit.png)"""
import numpy as np
from ambient_dsaudit.sim import Params, contexts
from ambient_dsaudit.est import (PRIOR, confusion, joint_audit, joint_audit2, draw_audit, draw_audit2,
                                 estimate_naive, estimate_em, estimate_ds, u_table, policies)

P = Params()
CTX = contexts()
U = [u_table(P, c) for c in CTX]
REPS = 200
ALPHA = 1.0


def val(C, pe, Ce):
    """Mean utility over contexts of the Bayes policy built from (pe, Ce); also blind and true-parameter Bayes."""
    v = [policies(u, C, PRIOR, pe, Ce, pe, Ce) for u in U]
    return {k: float(np.mean([x[k] for x in v])) for k in ("blind", "bayes_true", "bayes_naive")}


def v_of(C, pe, Ce):
    return val(C, pe, Ce)["bayes_naive"]          # 'bayes_naive' slot = the supplied estimate


print(f"Mean utility per message over {len(CTX)} contexts; uniform-error label and auditors; true mix 0.5/0.35/0.15; {REPS} audit sets per finite cell")
print("'naive' = auditor 1's label taken as truth (alpha=1); 'em-known' = EM with auditor 1's matrix known;")
print("'ds' = Dawid-Skene EM over two auditors and the classifier, no matrix known\n")

# ---- Part A: wrong assumed accuracy for a single auditor of true accuracy 0.8
print("=== A. EM with a wrongly assumed auditor accuracy (true auditor accuracy 0.8, one auditor)")
ASSUMED = (0.6, 0.7, 0.8, 0.9, 1.0)
resA = {}
for la in (0.7, 0.9):
    C, A = confusion(la), confusion(0.8)
    base = val(C, PRIOR, C)
    J = joint_audit(C, A, PRIOR)
    print(f"-- label accuracy {la}: true-parameter Bayes {base['bayes_true']:.4f}, blind {base['blind']:.4f}")
    print("   assumed   population   n=200 mean (std)   P(below blind) at n=200")
    for asm in ASSUMED:
        pe, Ce = estimate_em(J * 1e9, confusion(asm), iters=5000)
        pop = v_of(C, pe, Ce)
        rng = np.random.default_rng(int(1e3 * la) + int(100 * asm))
        xs = []
        for _ in range(REPS):
            pe, Ce = estimate_em(draw_audit(C, A, PRIOR, 200, rng), confusion(asm))
            xs.append(v_of(C, pe, Ce))
        xs = np.array(xs)
        resA[(la, asm)] = (pop, xs.mean())
        print(f"   {asm:5.2f}     {pop:.4f}      {xs.mean():.4f} ({xs.std():.4f})        {np.mean(xs < base['blind'] - 1e-12):.2f}")
    print()

# ---- Part B: Dawid-Skene with two auditors
print("=== B. Two auditors, no accuracy known: Dawid-Skene against single-auditor estimators")
PAIRS = ((0.8, 0.8), (0.9, 0.7), (0.7, 0.7))
NS = (50, 200, 1000)
resB = {}
for la in (0.7, 0.9):
    C = confusion(la)
    for (a1, a2) in PAIRS:
        A1, A2 = confusion(a1), confusion(a2)
        base = val(C, PRIOR, C)
        J2 = joint_audit2(C, A1, A2, PRIOR)
        pd, Cd, _, _ = estimate_ds(J2 * 1e9, iters=20000)
        print(f"-- label accuracy {la}, auditors {a1}/{a2}: true-param Bayes {base['bayes_true']:.4f}, blind {base['blind']:.4f}; "
              f"ds population {v_of(C, pd, Cd):.4f}")
        print("      n   naive(n)  em-known(n)  em-known(2n)  ds(n)  [std ds]  P(below blind): naive  em-known(2n)  ds")
        for n in NS:
            rng = np.random.default_rng(int(1e5 * la) + int(1e3 * a1) + int(10 * a2) + n)
            rows = []
            for _ in range(REPS):
                c2 = draw_audit2(C, A1, A2, PRIOR, n, rng)
                pn, Cn = estimate_naive(c2.sum(axis=1), ALPHA)  # auditor 1 vs classifier
                pk, Ck = estimate_em(c2.sum(axis=1), A1)
                pk2, Ck2 = estimate_em(draw_audit(C, A1, PRIOR, 2 * n, rng), A1)
                pdd, Cdd, _, _ = estimate_ds(c2, iters=2000, tol=1e-10)
                rows.append([v_of(C, pn, Cn), v_of(C, pk, Ck), v_of(C, pk2, Ck2), v_of(C, pdd, Cdd)])
            r = np.array(rows)
            bl = base['blind']
            resB[(la, a1, a2, n)] = r.mean(axis=0)
            print(f"   {n:5d}   {r[:,0].mean():.4f}   {r[:,1].mean():.4f}      {r[:,2].mean():.4f}      {r[:,3].mean():.4f}  [{r[:,3].std():.4f}]"
                  f"             {np.mean(r[:,0]<bl-1e-12):.2f}        {np.mean(r[:,2]<bl-1e-12):.2f}        {np.mean(r[:,3]<bl-1e-12):.2f}")
        resB[(la, a1, a2, 'pop')] = (base['bayes_true'], v_of(C, pd, Cd))
        print()

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, 2, figsize=(9, 3.4))
    for la, st in ((0.7, "C0"), (0.9, "C1")):
        axs[0].plot(ASSUMED, [resA[(la, a)][0] for a in ASSUMED], "o-", color=st, label=f"population, label acc {la}")
        axs[0].plot(ASSUMED, [resA[(la, a)][1] for a in ASSUMED], "s--", color=st, label=f"n=200, label acc {la}")
    axs[0].axvline(0.8, color="k", ls=":", lw=1); axs[0].set_xlabel("assumed auditor accuracy (true 0.8)")
    axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=6); axs[0].set_title("A. wrong assumed accuracy", fontsize=9)
    for k, (a1, a2) in enumerate(PAIRS):
        axs[1].plot(NS, [resB[(0.7, a1, a2, n)][3] for n in NS], "o-", color=f"C{k}", label=f"ds, auditors {a1}/{a2}")
        axs[1].plot(NS, [resB[(0.7, a1, a2, n)][0] for n in NS], "x--", color=f"C{k}", label=f"naive, {a1}/{a2}")
    axs[1].axhline(resB[(0.7, 0.8, 0.8, 'pop')][0], color="k", ls=":", lw=1, label="true-parameter Bayes")
    axs[1].set_xscale("log"); axs[1].set_xlabel("audited messages n"); axs[1].set_title("B. two auditors, label acc 0.7", fontsize=9)
    axs[1].legend(fontsize=6)
    fig.suptitle("Stylised model: learning an urgency label's reliability from noisy audits", fontsize=9)
    fig.tight_layout(); fig.savefig("experiments/dsaudit.png", dpi=110)
except ImportError:
    pass
