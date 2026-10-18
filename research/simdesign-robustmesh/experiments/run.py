"""Experiments for simdesign-robustmesh. Writes experiments/results.txt and designs.png.

Half-MBB, vf 0.5, p 3, beta 1..64 (30 iterations each). Filter radius as a share of the beam length
1/60, 1/30, 1/20, on meshes 60x20 and 180x60 (so 1, 2, 3 and 3, 6, 9 elements). Plain Heaviside
(gap 0) and robust (gap 0.2); every design is re-analysed at 0.5 +/- 0.2. One run per row.
The 120x40 rows (2, 4, 6 elements) are in simdesign-robustradius/experiments/results.txt.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robustmesh import run_mesh, RADIUS_FRACTIONS

MESHES = ((60, 20), (180, 60))
GAPS = (0.0, 0.2)
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say("Half-MBB, vf 0.5, p 3, beta 1..64 (30 it each); every design re-analysed at 0.5 +/- 0.2; one run per row.")
say("share = filter radius / beam length. Ms, Mv: min length scale (px) of solid / void, 98% opening rule at 0.5;")
say("Ms/nx, Mv/nx: the same as a share of the beam length.")
say()
say("mesh    share   r(px)  gap   c_e           c_b      c_d     grey   Ms  Mv  Ms/nx  Mv/nx  time")
designs = {}
for nx, ny in MESHES:
    for fr in RADIUS_FRACTIONS:
        for d in GAPS:
            t = time.time()
            r = run_mesh(nx, ny, fr, d)
            say(f"{nx:3d}x{ny:<3d} {fr:.4f}  {nx*fr:4.1f}  {d:3.1f}  {r['c_e']:12.1f} {r['c_b']:8.2f} {r['c_d']:8.2f}  {100*r['grey']:4.1f}%  "
                f"{r['ms']:3d} {r['mv']:3d}  {r['ms_share']:.3f}  {r['mv_share']:.3f}  {time.time()-t:4.0f}s")
            designs[(nx, fr, d)] = r["bp"]

fig, ax = plt.subplots(3, 4, figsize=(12, 5))
for i, fr in enumerate(RADIUS_FRACTIONS):
    for j, (nx, d) in enumerate([(nx, d) for nx, _ in MESHES for d in GAPS]):
        ax[i, j].imshow(1 - designs[(nx, fr, d)], cmap="gray", vmin=0, vmax=1)
        ax[i, j].set_title(f"{nx}x{nx // 3}, r={fr*nx:.0f}px, " + ("Heaviside" if d == 0 else f"robust {d}"), fontsize=8)
        ax[i, j].axis("off")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=110)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
