"""Experiments for simdesign-robustradius. Writes experiments/results.txt and designs.png.

Half-MBB beam, mesh 120x40, volume fraction 0.5, p 3, beta 1..64 (30 iterations each). Cone filter
radius rmin in {2, 4, 6} elements (1.7%, 3.3%, 5.0% of the beam length). Per radius: plain
Heaviside, robust with gap d_eta 0.1, robust with gap 0.2. One run per cell.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robustradius import run_case

NX, NY = 120, 40
RADII = (2, 4, 6)
CASES = (("heaviside", 0.2), ("robust", 0.1), ("robust", 0.2))
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say(f"Half-MBB {NX}x{NY}, vf 0.5, p 3, beta 1..64 (30 iterations each), one run per row.")
say("Heaviside rows are re-analysed at 0.5 +/- d_eta (the d_eta column) so every row is judged by the same erosion.")
say("c_e / c_b / c_d: compliance at thresholds 0.5+d_eta / 0.5 / 0.5-d_eta. Ms, Mv: min length scale (px) of solid / void,")
say("98% opening rule on the blueprint thresholded at 0.5; Ms/r: Ms divided by the filter radius in px.")
say()
say("rmin  formulation  d_eta   c_e       c_b      c_d     grey   Ms  Mv  Ms/r  Mv/r  time")
designs = {}
for rm in RADII:
    for name, d in CASES:
        t = time.time()
        r = run_case(NX, NY, rm, name, d_eta=d)
        say(f"{rm:3d}   {name:11s}  {d:4.1f}  {r['c_e']:9.1f} {r['c_b']:8.2f} {r['c_d']:8.2f}  {100*r['grey']:4.1f}%  "
            f"{r['ms']:3d} {r['mv']:3d}  {r['ms']/rm:4.2f}  {r['mv']/rm:4.2f}  {time.time()-t:4.0f}s")
        designs[(rm, name, d)] = r["blueprint"]

fig, ax = plt.subplots(3, 3, figsize=(10, 5))
for i, rm in enumerate(RADII):
    for j, (name, d) in enumerate(CASES):
        ax[i, j].imshow(1 - designs[(rm, name, d)], cmap="gray", vmin=0, vmax=1)
        ax[i, j].set_title(f"r={rm}px, {name}" + ("" if name == "heaviside" else f" d_eta={d}"), fontsize=8)
        ax[i, j].axis("off")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=120)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
