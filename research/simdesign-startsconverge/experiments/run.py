"""simdesign-startsconverge: do fixed-penalty SIMP outcomes still depend on the start after many more iterations?

Half-MBB 60x20, vf 0.5, p 3 (fixed), rmin 1.5, move 0.2. Starts: uniform 0.5, and 20 random starts of noise
half-width 0.3 (seeds 0..19, same generator as simdesign-starts). One run of 1200 iterations per start, with the
design snapshotted at 150, 300, 600 and 1200. Writes results.txt and converge.png.
"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "simdesign-starts", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_startsconverge import run_checkpoints, pairwise_disagreement
from simdesign_starts import random_start, holes, distance

NX, NY = 60, 20
CPS = [150, 300, 600, 1200]
SEEDS = range(int(os.environ.get("SEEDS", 20)))
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

t0 = time.time()
base = run_checkpoints(np.full((NY, NX), 0.5), NX, NY, CPS)
runs = [run_checkpoints(random_start(NX, NY, 0.5, 0.3, s), NX, NY, CPS) for s in SEEDS]
n = len(runs)
say(f"Half-MBB {NX}x{NY}, vf 0.5, fixed p 3, rmin 1.5 el. Uniform start (1 run) and {n} random starts of noise +/-0.3.")
say("c = compliance at p 3; spread = max/min-1; dist-u = median share of elements differing (x>0.5) from the uniform-start design at the same iteration;")
say("pair = median share differing between two random starts; gray = share of elements with 0.1<x<0.9; maxchg = median over starts of max|dx| in the last update.")
say()
say("iters  uniform_c   c_min    c_median  c_max    spread   beat_uniform  dist-u   pair    holes(min-med-max)  gray    maxchg")
rows = []
for k in CPS:
    cs = np.array([r[k]["compliance"] for r in runs])
    xs = [r[k]["x"] for r in runs]
    du = float(np.median([distance(x, base[k]["x"]) for x in xs]))
    pr = pairwise_disagreement(xs)
    hs = [holes(x) for x in xs]
    gray = float(np.median([np.mean((x > 0.1) & (x < 0.9)) for x in xs]))
    chg = float(np.median([r[k]["change"] for r in runs]))
    rows.append((k, cs, base[k]["compliance"]))
    say(f"{k:5d}  {base[k]['compliance']:8.2f}  {cs.min():7.2f}  {np.median(cs):7.2f}  {cs.max():7.2f}  {cs.max()/cs.min()-1:6.2%}   {int((cs < base[k]['compliance']).sum()):2d}/{n}        {du:5.1%}  {pr:5.1%}   {min(hs)}-{int(np.median(hs))}-{max(hs)}               {gray:5.1%}  {chg:.4f}")
say(f"\ntotal time {time.time()-t0:.0f} s")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

fig, ax = plt.subplots(figsize=(5.2, 3.6))
for j, (k, cs, cu) in enumerate(rows):
    ax.scatter(np.full(len(cs), j), cs, s=14, color="#c0392b", alpha=0.6, label="random starts" if j == 0 else None)
    ax.scatter([j], [cu], s=40, marker="D", color="#2471a3", label="uniform start" if j == 0 else None)
ax.set_xticks(range(len(rows))); ax.set_xticklabels([str(r[0]) for r in rows])
ax.set_xlabel("OC iterations (fixed p = 3)"); ax.set_ylabel("final compliance (p = 3)"); ax.set_title(f"half-MBB {NX}×{NY}")
ax.legend(frameon=False)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "converge.png"), dpi=130)
