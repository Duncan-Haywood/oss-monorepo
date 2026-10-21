"""Summarise results.json into results.txt: does the codesign-agri conclusion survive the swept constants?"""
import json, os
import numpy as np
from scipy.stats import spearmanr, binomtest
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
Ws, nom = R["worlds"], R["nominal"]
M = ["random search", "CMA-ES", "Bayesian opt (GP-EI)"]
P = list(Ws[0]["params"])
med = {m: np.array([np.median(w["final"][m]) for w in Ws]) for m in M}
refJ = np.array([w["ref"]["J"] for w in Ws])
reg = {m: refJ - med[m] for m in M}
L = [f"{len(Ws)} Latin-hypercube worlds over {len(P)} assumed constants; per world 8 seeds x 40 evaluations per method, regret = reference-optimum J minus median best J.",
     f"Nominal world (original constants): reference J {nom['ref']['J']:.3f}; median best J " + ", ".join(f"{m} {np.median(nom['final'][m]):.3f}" for m in M) + ".", "",
     "Regret to the reference optimum across worlds (median [10th, 90th percentile]; mean):"]
for m in M:
    r = reg[m]
    L.append(f"{m}: {np.median(r):.3f} [{np.percentile(r,10):.3f}, {np.percentile(r,90):.3f}]; mean {r.mean():.3f}")
L += ["", "Pairwise, per world (median over seeds; ties within 0.002 J count as ties):"]
for a, b in (("Bayesian opt (GP-EI)", "random search"), ("Bayesian opt (GP-EI)", "CMA-ES"), ("CMA-ES", "random search")):
    d = med[a] - med[b]
    w, l, t = int((d > 0.002).sum()), int((d < -0.002).sum()), int((abs(d) <= 0.002).sum())
    p = binomtest(w, w + l, 0.5).pvalue if w + l else float("nan")
    L.append(f"{a} vs {b}: wins {w}, losses {l}, ties {t}; sign test p = {p:.2g}; median gap {np.median(d):+.3f}")
order = sum(1 for i in range(len(Ws)) if med[M[2]][i] >= med[M[1]][i] >= med[M[0]][i])
L.append(f"Original ordering BO >= CMA-ES >= random holds in {order} of {len(Ws)} worlds.")
best = [M[int(np.argmax([med[m][i] for m in M]))] for i in range(len(Ws))]
L.append("Best method per world: " + ", ".join(f"{m} {best.count(m)}" for m in M))
close = {m: int((reg[m] <= 0.01).sum()) for m in M}
L.append("Worlds where the method's median is within 0.01 J of the reference: " + ", ".join(f"{m} {c}" for m, c in close.items()))
# evaluations to get within 0.02 of reference
L += ["", "Seeds (of 8) reaching J >= reference - 0.02 within 40 evaluations, summed over worlds, and median first-hit evaluation among those that do:"]
for m in M:
    f = [x for w in Ws for x in w["first"][m]]
    got = [x for x in f if x]
    L.append(f"{m}: {len(got)} of {len(f)}; median evaluation {np.median(got):.0f}")
# what the optimum looks like
nf = np.array([w["ref"]["x"][4] for w in Ws]); Fg = np.array([w["ref"]["x"][3] for w in Ws])
wd = np.array([w["ref"]["x"][0] for w in Ws]); cost = np.array([w["ref"]["cost"] for w in Ws])
L += ["", f"Reference-optimum design across worlds: fingers 2/3/4 = {int((nf==2).sum())}/{int((nf==3).sum())}/{int((nf==4).sum())} (nominal {nom['ref']['x'][4]}); "
      f"grip force at the 8 N bound (>= 7.9 N) in {int((Fg>=7.9).sum())} worlds; pad width at the 25 mm bound (>= 24.5) in {int((wd>=24.5).sum())}; "
      f"reference J range {refJ.min():.3f} to {refJ.max():.3f}; cost median {np.median(cost):.0f} USD.",
      f"Nominal-optimum transfer: the nominal reference design scored in each world, regret to that world's reference: ",]
import sys
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_agri_sweep import world as W
xn = nom["ref"]["x"]
evs = [W.make_evaluator(w["params"])(xn) for w in Ws]
feas = np.array([e["feasible"] for e in evs])
tr = np.array([refJ[i] - e["J"] for i, e in enumerate(evs)])[feas]
L[-1] += (f"over the cap in {int((~feas).sum())} of {len(Ws)} worlds (cost rises with servo and plastic price); in the other {int(feas.sum())}, regret median {np.median(tr):.3f}, "
          f"90th percentile {np.percentile(tr,90):.3f}, worst {tr.max():.3f}; regret over 0.05 in {int((tr>0.05).sum())}.")
L.append(f"Reference check: smallest regret of any method's median in any world {min(reg[m].min() for m in M):.4f} (negative would mean the reference was beaten).")
# sensitivity
L += ["", "Spearman rank correlation of each constant with (a) reference-optimum J, (b) reference finger count, (c) BO-minus-random gap, (d) BO-minus-CMA-ES gap (|rho| > 0.2 marked *; n = 100, 5% critical value about 0.20):"]
gap_br = med[M[2]] - med[M[0]]; gap_bc = med[M[2]] - med[M[1]]
for k in P:
    v = [w["params"][k] for w in Ws]
    cells = []
    for y in (refJ, nf, gap_br, gap_bc):
        rho = spearmanr(v, y)[0] if np.std(y) > 0 else float("nan")
        cells.append(f"{rho:+.2f}{'*' if abs(rho) > 0.2 else ''}")
    L.append(f"{k}: " + " | ".join(cells))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
# flat-landscape failures: seeds whose best design picks essentially nothing although the reference does
L2 = ["", "Stuck seeds (best J < 0.05 although the world's reference J >= 0.25), of 8 seeds, summed over worlds with such a reference:"]
big = [w for w in Ws if w["ref"]["J"] >= 0.25]
for m in M:
    L2.append(f"{m}: {sum(1 for w in big for x in w['final'][m] if x < 0.05)} of {8 * len(big)} seeds ({len(big)} worlds)")
bad = [(w["world"], w["ref"]["J"], np.median(w["final"][M[2]]), np.median(w["final"][M[0]])) for w in Ws if np.median(w["final"][M[2]]) < np.median(w["final"][M[0]])]
L2.append("Worlds where BO's median is below random search's: " + "; ".join(f"world {i} (reference {r:.3f}, BO {b:.3f}, random {c:.3f})" for i, r, b, c in bad))
open(os.path.join(HERE, "results.txt"), "a").write("\n".join(L2) + "\n")
print("\n".join(L2))
