"""simdesign-starts: spread of SIMP outcomes over random starting densities.

Half-MBB, vf 0.5, p 3, rmin 1.5, 150 sensitivity-filtered OC iterations, move 0.2.
Baseline start: uniform 0.5 (what the 99-line code uses). Random starts: uniform noise of half-width
s in {0.1, 0.3, 0.45} about 0.5, rescaled to volume 0.5, 30 seeds each. With and without penalty continuation.
Writes experiments/results.txt and spread.png.
"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_starts import run_from, random_start, holes, distance

MESHES = [(60, 20), (90, 30)]
SPREADS = [0.1, 0.3, 0.45]
SEEDS = range(30)
ITERS = 150
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say("Half-MBB, vf 0.5, p 3, rmin 1.5 el, 150 OC iterations. c = compliance at p 3 (lower is better). holes = enclosed voids at x>0.5.")
say("dist = share of elements whose 0/1 state differs from the uniform-start design of the same mesh and mode.")
say("30 seeds per spread. cont = penalty continuation 1 -> 3 over the first 75 iterations.")
say()
say("mesh    mode   start         c_min    c_median  c_max    spread(max/min-1)  beat uniform  median dist  holes (min-med-max)")
allc = {}
t0 = time.time()
for nx, ny in MESHES:
    for cont in (False, True):
        base = run_from(np.full((ny, nx), 0.5), nx, ny, iters=ITERS, continuation=cont)
        cb = base["compliance"]
        mode = "cont" if cont else "fixed"
        say(f"{nx}x{ny}  {mode:5s}  uniform 0.5   {cb:7.2f}  (single run)                                           holes {holes(base['x'])}")
        for s in SPREADS:
            cs, ds, hs = [], [], []
            for seed in SEEDS:
                r = run_from(random_start(nx, ny, 0.5, s, seed), nx, ny, iters=ITERS, continuation=cont)
                cs.append(r["compliance"]); ds.append(distance(r["x"], base["x"])); hs.append(holes(r["x"]))
            cs = np.array(cs); allc[(nx, ny, mode, s)] = cs
            say(f"{nx}x{ny}  {mode:5s}  noise +/-{s:<5}  {cs.min():7.2f}  {np.median(cs):7.2f}  {cs.max():7.2f}  {cs.max()/cs.min()-1:8.1%}          "
                f"{int((cs < cb).sum()):2d}/30         {np.median(ds):5.1%}      {min(hs)}-{int(np.median(hs))}-{max(hs)}")
say(f"\ntotal time {time.time()-t0:.0f} s")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

fig, axes = plt.subplots(1, len(MESHES), figsize=(9, 3.6), sharey=False)
for ax, (nx, ny) in zip(axes, MESHES):
    for k, (mode, col) in enumerate((("fixed", "#c0392b"), ("cont", "#2471a3"))):
        for j, s in enumerate(SPREADS):
            cs = allc[(nx, ny, mode, s)]
            ax.scatter(np.full(len(cs), j + (k - 0.5) * 0.3), cs, s=12, color=col, alpha=0.6, label=mode if j == 0 else None)
    ax.set_xticks(range(len(SPREADS))); ax.set_xticklabels([f"±{s}" for s in SPREADS])
    ax.set_xlabel("noise half-width of the starting density"); ax.set_title(f"half-MBB {nx}×{ny}"); ax.set_ylabel("final compliance (p = 3)")
axes[0].legend(frameon=False)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "spread.png"), dpi=130)
