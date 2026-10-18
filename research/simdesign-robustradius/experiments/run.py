"""Sweep filter radius (2, 4, 6 elements) x design threshold gap (0, 0.1, 0.2) on the half-MBB beam.

Mesh 120x40, volume 0.5, p 3, beta 1..64 (30 iterations each), one run per cell. Cases run in
parallel processes. Writes experiments/results.txt and designs.png.
"""
import os, sys, time
from concurrent.futures import ProcessPoolExecutor
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robustradius import run_case, CASES

NX, NY = 120, 40


def job(c):
    t = time.time(); r = run_case(NX, NY, *c); r["t"] = time.time() - t; return r


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(job, CASES))
    out = ["Half-MBB 120x40, vf 0.5, p 3, beta 1..64 (30 it each). d_eta 0 = plain Heaviside.",
           "All designs re-analysed at thresholds 0.7 / 0.5 / 0.3. spread = c_e / c_d - 1.",
           "Ms, Mv: min length scale (px) of solid / void, 98% opening rule at 0.5.", "",
           "rmin  d_eta   c_e         c_b      c_d     spread  grey_b   Ms  Mv   time"]
    for r in res:
        out.append(f"{r['rmin']:4.1f}  {r['d_eta']:.1f}  {r['c_e']:10.1f} {r['c_b']:8.2f} {r['c_d']:8.2f} "
                   f"{100*(r['c_e']/r['c_d']-1):7.1f}% {100*r['grey']:5.1f}%  {r['ms']:3d} {r['mv']:3d}  {r['t']:4.0f}s")
    print("\n".join(out))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    fig, ax = plt.subplots(3, 3, figsize=(9, 4.5))
    for r, a in zip(res, ax.flat):
        a.imshow(1 - r["bp"], cmap="gray", vmin=0, vmax=1); a.axis("off")
        a.set_title(f"rmin {r['rmin']:g}, d_eta {r['d_eta']:g}", fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=120)
