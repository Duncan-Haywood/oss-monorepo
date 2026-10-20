"""Experiments for simdesign-robust. Writes experiments/results.txt and designs.png.

Half-MBB beam, volume fraction 0.5, p 3, cone filter radius fixed at 3.33% of the beam length
(rmin = nx/30 elements), meshes 60x20, 120x40, 180x60. Two formulations per mesh, each run once:
  heaviside: simdesign-heaviside (single threshold 0.5), beta 1..64.
  robust:    eroded 0.7 / blueprint 0.5 / dilated 0.3 thresholds (d_eta 0.2), same beta schedule.
For each design the three fields are re-analysed at the same thresholds (heaviside design too, so
the two are compared on equal terms), thresholded at 0.5 for the length-scale measure.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robust import robust_topopt
from simdesign_heaviside import topopt, project, grey_share, min_length_scale
from simdesign_topopt import fe_compliance, mbb_problem

out = []
def say(s=""):
    print(s, flush=True); out.append(s)

D = 0.2
say("Half-MBB, vf 0.5, p 3, filter radius rmin = nx/30 elements, beta 1..64 (30 iterations each).")
say("c_e / c_b / c_d: compliance of the design projected at thresholds 0.7 / 0.5 / 0.3 (eroded / blueprint / dilated).")
say("spread = c_e / c_d - 1. Ms, Mv: minimum length scale (pixels) of solid and void in the blueprint thresholded at 0.5;")
say("Ms/nx: Ms as a share of the beam length (98% opening rule, `simdesign-heaviside`).")
say()
say("mesh    formulation   c_e      c_b      c_d     spread   grey_b   Ms  Mv  Ms/nx  Mv/nx   time")
designs = {}
for nx, ny in [(60, 20), (120, 40), (180, 60)]:
    rm = nx / 30
    f, fixed = mbb_problem(nx, ny)
    for name in ("heaviside", "robust"):
        t = time.time()
        if name == "heaviside":
            r = topopt(nx, ny, 0.5, rm, mode="heaviside")
            fields = [project(r["xt"].reshape(-1), r["beta"], e) for e in (0.5 + D, 0.5, 0.5 - D)]
            cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fixed, 3.0)[0] for p in fields]
            bp = fields[1].reshape(ny, nx)
        else:
            r = robust_topopt(nx, ny, 0.5, rm, d_eta=D)
            cs = [r["c_eroded"], r["c_blueprint"], r["c_dilated"]]
            bp = r["blueprint"]
        mask = bp > 0.5
        ms, mv = min_length_scale(mask), min_length_scale(~mask)
        say(f"{nx:3d}x{ny:<3d} {name:11s} {cs[0]:8.2f} {cs[1]:8.2f} {cs[2]:8.2f} {100*(cs[0]/cs[2]-1):6.1f}%  "
            f"{100*grey_share(bp):5.1f}%  {ms:3d} {mv:3d}  {ms/nx:.3f}  {mv/nx:.3f}  {time.time()-t:4.0f}s")
        designs[(nx, name)] = bp

fig, ax = plt.subplots(3, 2, figsize=(8, 5))
for i, nx in enumerate((60, 120, 180)):
    for j, name in enumerate(("heaviside", "robust")):
        ax[i, j].imshow(1 - designs[(nx, name)], cmap="gray", vmin=0, vmax=1)
        ax[i, j].set_title(f"{name}, {nx}x{nx // 3}", fontsize=8); ax[i, j].axis("off")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=120)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
