"""Experiment for simdesign-volscale. Writes experiments/results.txt and scaling.png.

For each problem and volume fraction v: SIMP compliance (p = 3, sensitivity filter), compliance of the
design thresholded to 0/1 at the volume quantile, and the reference C_solid / v of a plate thinned
uniformly to volume v (stiffness proportional to thickness). Then a power-law fit C = a v^-k.
"""
import os, sys
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_volscale import simp, fe_compliance, mbb_problem, cantilever_problem, binarise, fit_power

PROBLEMS = {"cantilever 60x20": (60, 20, cantilever_problem, 1.5),
            "half-MBB 90x30": (90, 30, mbb_problem, 2.0)}
VOLS = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
out = []
def say(s=""):
    print(s); out.append(s)

res = {}
for name, (nx, ny, prob, rmin) in PROBLEMS.items():
    f, fixed = prob(nx, ny)
    cs = fe_compliance(np.ones((ny, nx)), nx, ny, f, fixed)[0]
    say(f"## {name}  (rmin {rmin}, p 3; solid-plate compliance {cs:.2f})")
    say("(iters = 300 means the 300-iteration cap was hit before the 0.01 change tolerance)")
    say("v | iters | C_simp | C_binary | C_simp*v/C_solid | C_binary*v/C_solid")
    rows = []
    for v in VOLS:
        r = simp(nx, ny, v, 3.0, rmin, prob, max_iter=300)
        xb = binarise(r["x"], v)
        cb = fe_compliance(xb.astype(float), nx, ny, f, fixed)[0]
        rows.append((v, r["iterations"], r["compliance"], cb, cs))
        say(f"{v:.2f} | {r['iterations']} | {r['compliance']:.2f} | {cb:.2f} | {r['compliance']*v/cs:.3f} | {cb*v/cs:.3f}")
    res[name] = rows
    a = np.array(rows)
    sel = a[:, 0] >= 0.3  # below this the binary design is disconnected on these grids (see README)
    for lbl, col in (("SIMP", 2), ("binary", 3)):
        k, A = fit_power(a[sel, 0], a[sel, col])
        say(f"fit {lbl} over v in [0.3, 0.8]: C = {A:.1f} v^-{k:.3f}")
    kt, _ = fit_power(a[sel, 0], a[sel, 4] / a[sel, 0])
    say(f"thinned plate: k = {kt:.3f} (exact 1)")
    say()
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

fig, axs = plt.subplots(1, 2, figsize=(9, 3.6))
for ax, (name, rows) in zip(axs, res.items()):
    a = np.array(rows)
    ax.loglog(a[:, 0], a[:, 4] / a[:, 0], "k--", label="thinned plate $C_{solid}/v$")
    ax.loglog(a[:, 0], a[:, 2], "o-", label="SIMP (grey)")
    ax.loglog(a[:, 0], a[:, 3], "s-", label="thresholded 0/1")
    ax.set_title(name); ax.set_xlabel("volume fraction v"); ax.set_ylabel("compliance")
    ax.legend(fontsize=7)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "scaling.png"), dpi=110)
