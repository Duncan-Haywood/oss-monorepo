"""simdesign-contlength: how long must the SIMP penalty ramp be to remove the start dependence?

Half-MBB, vf 0.5, final p 3, rmin 1.5, exactly 150 OC iterations. Penalty goes 1 -> 3 in steps of 0.5 over the first
`ramp` iterations, then holds; ramp 0 = fixed p 3. Starts: uniform noise +/-0.3 about 0.5 (rescaled to volume 0.5), seeds 0..N-1.
Writes experiments/results.txt and ramp.png.
"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_contlength import run_ramp, random_start, holes, distance

MESHES = [((60, 20), 20), ((90, 30), 12)]   # (mesh, number of random starts)
RAMPS = [0, 6, 12, 25, 50, 75, 112]
NOISE, ITERS = 0.3, 150
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say("Half-MBB, vf 0.5, final p 3, rmin 1.5 el, 150 OC iterations, noise +/-0.3. ramp = iterations over which p goes 1 -> 3 (0 = fixed p 3).")
say("c = compliance at p 3 (lower is better). dist = share of elements whose 0/1 state differs from the uniform-start design with the same ramp.")
say()
say("mesh    ramp  c_uniform  c_min    c_median  c_max    spread   median dist  max dist  holes (min-med-max)")
res = {}
t0 = time.time()
for (nx, ny), n in MESHES:
    for ramp in RAMPS:
        base = run_ramp(np.full((ny, nx), 0.5), nx, ny, ramp, iters=ITERS)
        cs, ds, hs = [], [], []
        for seed in range(n):
            r = run_ramp(random_start(nx, ny, 0.5, NOISE, seed), nx, ny, ramp, iters=ITERS)
            cs.append(r["compliance"]); ds.append(distance(r["x"], base["x"])); hs.append(holes(r["x"]))
        cs = np.array(cs); res[(nx, ny, ramp)] = (base["compliance"], cs, np.array(ds))
        say(f"{nx}x{ny}  {ramp:4d}  {base['compliance']:8.2f}  {cs.min():7.2f}  {np.median(cs):7.2f}  {cs.max():7.2f}  {cs.max()/cs.min()-1:6.2%}   "
            f"{np.median(ds):7.2%}     {np.max(ds):6.2%}   {min(hs)}-{int(np.median(hs))}-{max(hs)}  (n={n})")
say(f"\ntotal time {time.time()-t0:.0f} s")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

fig, axes = plt.subplots(1, 2, figsize=(9, 3.6))
for ax, ((nx, ny), n) in zip(axes, MESHES):
    ax.plot(range(len(RAMPS)), [np.median(res[(nx, ny, r)][2]) * 100 for r in RAMPS], "o-", color="#2471a3", label="median")
    ax.plot(range(len(RAMPS)), [np.max(res[(nx, ny, r)][2]) * 100 for r in RAMPS], "s--", color="#c0392b", label="max over starts")
    ax.set_xticks(range(len(RAMPS))); ax.set_xticklabels([str(r) for r in RAMPS])
    ax.set_xlabel("penalty ramp length (iterations; 0 = fixed p = 3)"); ax.set_ylabel("elements differing from uniform-start design (%)")
    ax.set_title(f"half-MBB {nx}×{ny}, {n} random starts")
axes[0].legend(frameon=False)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "ramp.png"), dpi=130)
