"""Experiments for simdesign-heaviside. Writes experiments/results.txt and designs.png.

1. Three formulations on half-MBB 90x30 (vf 0.5, p 3, filter radius 3 elements): sensitivity filter
   (simdesign-topopt), density filter, density filter + Heaviside projection with beta continuation.
2. Mesh refinement at a fixed physical filter radius (3.33% of the beam length), 60x20 to 180x60.
3. Beta continuation vs starting at a large beta, same iteration budget.
All runs are deterministic; each setting is run once.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_heaviside import (topopt, grey_share, checker_share, min_length_scale)
from simdesign_heaviside.proj import retained_after_opening
from simdesign_topopt import simp, fe_compliance, mbb_problem, binarise

out = []
def say(s=""):
    print(s); out.append(s)

def discrete(x, nx, ny):
    """Threshold at the quantile that keeps the field's volume; re-analyse with void stiffness 1e-3."""
    mask = binarise(x, volfrac=float(x.mean()))
    f, fixed = mbb_problem(nx, ny)
    c = fe_compliance(np.where(mask, 1.0, 0.001), nx, ny, f, fixed, 3.0)[0]
    return mask, c

def row(name, x, c, it, nx, ny, extra=""):
    mask, cd = discrete(x, nx, ny)
    ms, mv = min_length_scale(mask), min_length_scale(~mask)
    say(f"{name:22s} {c:9.2f} {cd:9.2f} {100*(cd/c-1):+7.1f}% {100*grey_share(x):6.1f}% "
        f"{100*checker_share(x):5.1f}% {ms:3d} {mv:3d} {it:5d} {extra}")
    return mask, cd, ms, mv

HDR = "formulation              model-c  discr-c  gap       grey  chk   Ms  Mv   iter"

say("== 1. Formulations, half-MBB 90x30, vf 0.5, p 3, filter radius 3 elements")
say("(model-c: compliance of the field the optimiser sees; discr-c: threshold at the same volume and re-analyse;"
    " Ms/Mv: minimum length scale of solid/void in pixels, 98% opening rule)")
say(HDR)
nx, ny, vf, rmin = 90, 30, 0.5, 3.0
designs = {}
t = time.time(); r = simp(nx, ny, vf, 3.0, rmin, mbb_problem)
designs["sensitivity filter"] = r["x"]
row("sensitivity filter", r["x"], r["compliance"], r["iterations"], nx, ny)
r = topopt(nx, ny, vf, rmin, mode="density"); designs["density filter"] = r["xp"]
row("density filter", r["xp"], r["compliance"], r["iterations"], nx, ny)
r = topopt(nx, ny, vf, rmin, mode="heaviside"); designs["density + Heaviside"] = r["xp"]
row("density + Heaviside", r["xp"], r["compliance"], r["iterations"], nx, ny, f"final beta {r['beta']:.0f}")
say(f"(section 1: {time.time()-t:.0f} s)")

say(); say("== 2. Mesh refinement, filter radius fixed at 3.33% of the beam length (rmin = nx/30 elements)")
say("mesh    formulation              model-c  discr-c  gap       grey  chk   Ms  Mv   iter   Ms/nx")
for nx, ny in [(60, 20), (120, 40), (180, 60)]:
    rm = nx / 30
    for name in ("sensitivity filter", "density + Heaviside"):
        if name == "sensitivity filter":
            r = simp(nx, ny, 0.5, 3.0, rm, mbb_problem); x, c, it = r["x"], r["compliance"], r["iterations"]
        else:
            r = topopt(nx, ny, 0.5, rm, mode="heaviside"); x, c, it = r["xp"], r["compliance"], r["iterations"]
        mask, cd = discrete(x, nx, ny)
        ms, mv = min_length_scale(mask), min_length_scale(~mask)
        say(f"{nx:3d}x{ny:<3d} {name:22s} {c:9.2f} {cd:9.2f} {100*(cd/c-1):+7.1f}% {100*grey_share(x):6.1f}% "
            f"{100*checker_share(x):5.1f}% {ms:3d} {mv:3d} {it:5d}   {ms/nx:.3f}")

say(); say("== 3. Beta continuation vs a large beta from the start (90x30, same 210 iterations)")
say(HDR)
nx, ny = 90, 30
for label, kw in [("continuation 1..64", dict(betas=(1, 2, 4, 8, 16, 32, 64), iters_per_beta=30)),
                  ("beta 16 from start", dict(betas=(16,), iters_per_beta=210)),
                  ("beta 64 from start", dict(betas=(64,), iters_per_beta=210))]:
    r = topopt(nx, ny, 0.5, 3.0, mode="heaviside", **kw)
    row(label, r["xp"], r["compliance"], r["iterations"], nx, ny)

fig, ax = plt.subplots(len(designs), 1, figsize=(6, 1.7 * len(designs)))
for a, (k, x) in zip(ax, designs.items()):
    a.imshow(1 - x, cmap="gray", vmin=0, vmax=1); a.set_title(k, fontsize=8); a.axis("off")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=120)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
