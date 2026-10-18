"""Experiments for simdesign-robustadapt. Writes experiments/results.txt and history.png.

Same nine cases as simdesign-robustmove (60x20 at r 2..5 elements; 120x40 at r 4, 6, 8), robust gap 0.2,
vf 0.5, p 3, beta 1..64 (30 it each). Three move-limit rules: fixed 0.2, fixed 0.05, adaptive (start 0.2,
halve after a >3x compliance spike, floor 0.025, x1.25 after 10 calm iterations, cap 0.2).
A run failed if its blueprint compliance exceeds 1.5x the best of the three at the same mesh and radius.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_robustadapt import MoveRule, fixed, run_rule, failed

CASES = [(60, 20, r) for r in (2.0, 2.5, 3.0, 3.5, 4.0, 5.0)] + [(120, 40, r) for r in (4.0, 6.0, 8.0)]
RULES = {"fixed 0.2": lambda: fixed(0.2), "fixed 0.05": lambda: fixed(0.05),
         "adaptive": lambda: MoveRule(0.2, adaptive=True)}
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

say("Robust (gap 0.2) half-MBB, vf 0.5, p 3, beta 1..64 (30 it each); re-analysed at 0.5 +/- 0.2; one deterministic run per row.")
say("mean mv: mean move limit over the 210 iterations. FAIL: blueprint compliance > 1.5x the best of the three rules.")
say()
say("mesh    r(px)  rule         c_e           c_b      c_d     spikes  mean mv   time  status")
status, hist = {}, {}
for nx, ny, r in CASES:
    res = {}
    for name, mk in RULES.items():
        t = time.time(); o = run_rule(nx, ny, r, mk()); o["time"] = time.time() - t
        res[name] = o; hist[(nx, r, name)] = o
    best = min(o["c_b"] for o in res.values())
    for name, o in res.items():
        st = "FAIL" if failed(o["c_b"], best) else "ok"
        status[(nx, r, name)] = st
        say(f"{nx:3d}x{ny:<3d} {r:5.1f}  {name:10s} {o['c_e']:12.1f} {o['c_b']:8.2f} {o['c_d']:8.2f}  {o['n_spike']:5d}  {o['mean_move']:7.3f}  {o['time']:4.0f}s  {st}")
say()
for name in RULES:
    sub = [s for (nx, r, n), s in status.items() if n == name]
    say(f"{name:10s}: {sum(s == 'FAIL' for s in sub)} of {len(sub)} runs failed")
say()
for name in RULES:
    ratios = []
    for nx, ny, r in CASES:
        best = min(hist[(nx, r, n)]["c_b"] for n in RULES)
        ratios.append(hist[(nx, r, name)]["c_b"] / best)
    say(f"{name:10s}: blueprint compliance / best-of-three, mean {sum(ratios)/len(ratios):.3f}, max {max(ratios):.3f}")

fig, ax = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for a, (nx, r) in zip(ax, [(60, 3.0), (60, 4.0)]):
    for name, c in zip(RULES, ("tab:red", "tab:blue", "tab:green")):
        a.semilogy(hist[(nx, r, name)]["history"], color=c, lw=1, label=name)
    for k in range(1, 7):
        a.axvline(30 * k, color="0.8", lw=0.5)
    a.set_title(f"{nx}x{nx // 3}, r = {r:g} elements", fontsize=9); a.set_xlabel("iteration (beta doubles every 30)")
ax[0].set_ylabel("worst-case compliance"); ax[0].legend(fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "history.png"), dpi=110)
with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
