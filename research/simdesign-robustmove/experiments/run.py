"""Experiments for simdesign-robustmove. Writes experiments/results.txt and history.png.

Robust (gap 0.2) half-MBB, vf 0.5, p 3, beta 1..64 (30 it each). The optimality-criteria move limit
is 0.2 (the earlier projects' value), 0.1 and 0.05. Cases: 60x20 at radii 2, 2.5, 3, 3.5, 4, 5 elements
and 120x40 at 4, 6, 8. Every design is re-analysed at thresholds 0.5 +/- 0.2. One run per cell
(the optimisation is deterministic). A run failed if its blueprint compliance exceeds 1.5x the best at
the same mesh and radius.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robustmove import run_move, failed, MOVES

CASES = [(60, 20, r) for r in (2.0, 2.5, 3.0, 3.5, 4.0, 5.0)] + [(120, 40, r) for r in (4.0, 6.0, 8.0)]
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say("Robust (gap 0.2) half-MBB, vf 0.5, p 3, beta 1..64 (30 it each); re-analysed at 0.5 +/- 0.2; one run per row.")
say("spikes: iterations whose worst-case compliance is >3x the previous iteration's; max x: the largest such ratio.")
say("FAIL: blueprint compliance > 1.5x the best of the three moves at the same mesh and radius.")
say()
say("mesh    r(px)  move   c_e           c_b      c_d     spikes  max x    time  status")
rows, hist = [], {}
for nx, ny, r in CASES:
    res = []
    for mv in MOVES:
        t = time.time()
        o = run_move(nx, ny, r, mv)
        o["time"] = time.time() - t
        res.append(o)
        hist[(nx, r, mv)] = o["history"]
    best = min(o["c_b"] for o in res)
    for o in res:
        st = "FAIL" if failed(o["c_b"], best) else "ok"
        rows.append((nx, r, o["move"], st))
        say(f"{nx:3d}x{ny:<3d} {r:5.1f}  {o['move']:4.2f}  {o['c_e']:12.1f} {o['c_b']:8.2f} {o['c_d']:8.2f}  {o['n_spike']:5d}  {o['max_ratio']:8.1f}  {o['time']:4.0f}s  {st}")
say()
for mv in MOVES:
    sub = [s for (_, _, m, s) in rows if m == mv]
    say(f"move {mv:4.2f}: {sum(s == 'FAIL' for s in sub)} of {len(sub)} runs failed")

fig, ax = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for a, (nx, r) in zip(ax, [(60, 3.0), (60, 4.0)]):
    for mv, c in zip(MOVES, ("tab:red", "tab:orange", "tab:blue")):
        a.semilogy(hist[(nx, r, mv)], color=c, lw=1, label=f"move {mv}")
    for k in range(1, 7):
        a.axvline(30 * k, color="0.8", lw=0.5)
    a.set_title(f"{nx}x{nx // 3}, r = {r:g} elements", fontsize=9); a.set_xlabel("iteration (beta doubles every 30)")
ax[0].set_ylabel("worst-case compliance"); ax[0].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "history.png"), dpi=110)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
