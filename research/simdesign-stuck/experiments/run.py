"""simdesign-stuck: can penalty continuation free SIMP runs stuck in a worse optimum?

Half-MBB 60x20, vf 0.5, rmin 1.5, move 0.2. Stage 1 reproduces simdesign-startsconverge (uniform start + 20 random
starts, seeds 0..19, 1200 iterations at p 3). A start is "stuck" if its 0/1 layout differs from the uniform-start
design in >= 1% of elements. Each stuck start is then given (a) CONTROL: 1200 more iterations at p 3, and
(b) CONTINUATION: p 1 for 100, p 2 for 100, p 3 for 1000. Writes results.txt and stuck.png.
"""
import os, sys, time
import numpy as np
HERE = os.path.dirname(__file__)
for p in ("src",):
    sys.path.insert(0, os.path.join(HERE, "..", p))
sys.path.insert(0, os.path.join(HERE, "..", "..", "simdesign-starts", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_stuck import stuck_starts, continue_schedule
from simdesign_startsconverge import run_checkpoints
from simdesign_starts import random_start, holes, distance
from simdesign_topopt.simp import fe_compliance, mbb_problem

NX, NY = 60, 20
SEEDS = range(int(os.environ.get("SEEDS", 20)))
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

f, fixed = mbb_problem(NX, NY)
comp = lambda x: fe_compliance(x, NX, NY, f, fixed, 3.0)[0]
t0 = time.time()
ux = run_checkpoints(np.full((NY, NX), 0.5), NX, NY, [1200])[1200]["x"]
xs = [run_checkpoints(random_start(NX, NY, 0.5, 0.3, s), NX, NY, [1200])[1200]["x"] for s in SEEDS]
uc = comp(ux)
idx = stuck_starts(xs, ux, 0.01)
say(f"Half-MBB {NX}x{NY}, vf 0.5, rmin 1.5. Uniform start design after 1200 its at p 3: c = {uc:.2f}, holes {holes(ux)}.")
say(f"{len(idx)} of {len(xs)} random starts (seeds {list(SEEDS)[0]}..{list(SEEDS)[-1]}) are stuck (>= 1% of elements differ from it): seeds {idx}.")
say()
say("seed  c_1200   dist-u   holes | CONTROL (+1200 its p 3): c      dist-u  holes | CONTINUATION (p1:100,p2:100,p3:1000): c      dist-u  holes  freed?")
rows = []
for i in idx:
    c0, d0 = comp(xs[i]), distance(xs[i], ux)
    xc = run_checkpoints(xs[i], NX, NY, [1200])[1200]["x"]
    xk = continue_schedule(xs[i], NX, NY, [(1.0, 100), (2.0, 100), (3.0, 1000)])
    cc, dc, ck, dk = comp(xc), distance(xc, ux), comp(xk), distance(xk, ux)
    freed = dk < 0.01
    rows.append((i, c0, cc, ck, freed))
    say(f"{i:4d}  {c0:7.2f}  {d0:6.1%}   {holes(xs[i])}   |                          {cc:7.2f}  {dc:6.1%}   {holes(xc)}   |                                       {ck:7.2f}  {dk:6.1%}   {holes(xk)}    {'yes' if freed else 'no'}")
if rows:
    n = len(rows)
    say(f"\nfreed to the uniform-start layout (< 1% of elements differ) by continuation: {sum(r[4] for r in rows)}/{n}; "
        f"continuation compliance below the stuck design's in {sum(r[3] < r[1] - 1e-6 for r in rows)}/{n}; control below in {sum(r[2] < r[1] - 1e-6 for r in rows)}/{n}.")
say(f"\ntotal time {time.time()-t0:.0f} s")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

if rows:
    fig, ax = plt.subplots(figsize=(5.2, 3.6))
    for j, (lab, col) in enumerate([("stuck (1200 its)", "#c0392b"), ("+1200 its p 3", "#7f8c8d"), ("continuation", "#1e8449")]):
        ax.scatter(np.full(len(rows), j), [r[1 + j] for r in rows], s=18, color=col, alpha=0.7)
    ax.axhline(uc, color="#2471a3", ls="--", label="uniform start")
    ax.set_xticks(range(3)); ax.set_xticklabels(["stuck\n(1200 its)", "control\n+1200 its", "continuation\np1→2→3"])
    ax.set_ylabel("compliance (p = 3)"); ax.set_title(f"half-MBB {NX}×{NY}: stuck starts"); ax.legend(frameon=False)
    fig.tight_layout(); fig.savefig(os.path.join(HERE, "stuck.png"), dpi=130)
