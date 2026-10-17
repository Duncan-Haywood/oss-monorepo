"""Experiments for simdesign-topopt. Writes experiments/results.txt, mbb.png, mbb.stl.

1. Cantilever 32x20 (vf 0.4, p 3, rmin 1.2) and half-MBB 60x20 (vf 0.5, p 3, rmin 1.5).
2. Filter on/off and penalty p = 1 vs 3 on the MBB problem.
3. Mesh refinement with the filter radius scaled with the mesh (same physical radius).
4. Density field -> binary part: compliance after thresholding, connectivity, feature size, STL.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_topopt import (simp, fe_compliance, mbb_problem, cantilever_problem, binarise,
                              largest_component, min_feature_px, write_extruded_stl, stl_volume)

out = []
def say(s=""):
    print(s); out.append(s)

def grey(x):  # share of elements neither near 0 nor near 1
    return float(np.mean((x > 0.1) & (x < 0.9)))

def checker(x):
    """Share of 2x2 blocks whose diagonals are solid/void opposite (checkerboard cells), at threshold 0.5."""
    b = x > 0.5
    a, c, d, e = b[:-1, :-1], b[:-1, 1:], b[1:, :-1], b[1:, 1:]
    return float(np.mean((a == e) & (c == d) & (a != c)))

def binary_compliance(mask, nelx, nely, problem, penal=3.0):
    f, fixed = problem(nelx, nely)
    return fe_compliance(np.where(mask, 1.0, 0.001), nelx, nely, f, fixed, penal)[0]

say("== 1. Reference problems (sensitivity filter, OC, move 0.2, tol 0.01, max 200 it)")
res = {}
for name, (nx, ny, vf, rmin, prob) in {"cantilever": (32, 20, 0.4, 1.2, cantilever_problem),
                                         "mbb": (60, 20, 0.5, 1.5, mbb_problem)}.items():
    t = time.time(); r = simp(nx, ny, vf, 3.0, rmin, prob); res[name] = r
    say(f"{name:11s} {nx}x{ny} vf={vf} rmin={rmin}: compliance {r['compliance']:.2f} "
        f"(start {r['history'][0]:.2f}), volume {r['volume']:.4f}, {r['iterations']} it, "
        f"grey {grey(r['x']):.3f}, {time.time()-t:.1f} s")

say(); say("== 2. Ablations on half-MBB 60x20, vf 0.5")
say("filter       p   compliance  grey-share  checkerboard  iterations")
for filt in ("sensitivity", "none"):
    for p in (3.0, 1.0):
        r = simp(60, 20, 0.5, p, 1.5, mbb_problem, filter_mode=filt)
        say(f"{filt:11s} {p:.0f}  {r['compliance']:10.2f}  {grey(r['x']):9.3f}  {checker(r['x']):11.3f}  {r['iterations']:5d}")
say("p = 1 is a variable-thickness plate (no penalisation, so no black-and-white topology).")

say(); say("== 3. Mesh refinement, same physical filter radius (0.025 of the beam length), MBB, vf 0.5")
say("mesh      rmin(px)  compliance  grey  checkerboard  iterations")
for nx, ny in [(30, 10), (60, 20), (120, 40)]:
    rmin = 0.025 * nx
    r = simp(nx, ny, 0.5, 3.0, rmin, mbb_problem, max_iter=200)
    say(f"{nx:3d}x{ny:<3d}  {rmin:7.2f}   {r['compliance']:9.2f}  {grey(r['x']):.3f}  {checker(r['x']):.3f}  {r['iterations']:5d}")

say(); say("== 4. From density field to printable part (MBB 60x20 design from section 1)")
r = res["mbb"]; x = r["x"]; ny, nx = x.shape
f, fixed = mbb_problem(nx, ny)
mask = binarise(x, volfrac=0.5)
big, ncomp = largest_component(mask)
c_cont = r["compliance"]; c_bin = binary_compliance(mask, nx, ny, mbb_problem)
say(f"continuous design compliance {c_cont:.2f}; thresholded at the 50% volume quantile: {c_bin:.2f} "
    f"({100*(c_bin/c_cont-1):+.1f}%)")
say(f"connected components of thresholded design: {ncomp}; kept the largest ({int(big.sum())}/{int(mask.sum())} px)")
say(f"shortest solid run along rows/columns: {min_feature_px(big)} px (upper bound on minimum bar width)")
# mirror about the symmetry plane (left edge) to get the full beam, scale: 1 px = 1 mm, 5 mm thick
full = np.hstack([big[:, ::-1], big])
tri = write_extruded_stl(full, os.path.join(HERE, "mbb.stl"), pixel_mm=1.0, thickness_mm=5.0)
vol = stl_volume(os.path.join(HERE, "mbb.stl"))
say(f"mirrored full beam {full.shape[1]}x{full.shape[0]} mm, {tri} triangles, STL volume {vol:.0f} mm^3 "
    f"(pixels x thickness = {full.sum()*5} mm^3)")

fig, ax = plt.subplots(1, 3, figsize=(12, 2.6))
for a, img, t in zip(ax, (res["cantilever"]["x"], x, full), ("cantilever 32x20", "half-MBB 60x20 (density)", "full beam, thresholded")):
    a.imshow(1 - img, cmap="gray", vmin=0, vmax=1); a.set_title(t, fontsize=9); a.axis("off")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "mbb.png"), dpi=130)

with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
