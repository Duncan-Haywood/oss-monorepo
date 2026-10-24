"""How many SKY130 mappings does a cheap screen need before it has found the best design?
Run: PYTHONPATH=src python3 experiments/run.py   (stdlib only; writes results.txt)"""
import os
from eda_latencyhalve import screen as S

D = os.path.dirname(os.path.abspath(__file__))
rows = S.load(os.path.join(D, "mapped.json"))
name = lambda i: f"p{rows[i]['p']}w{rows[i]['wb']}"
TRIALS, N0 = 5000, 20
out = ["# 40 MAC-engine designs (p = 1..8 lanes, wb = 4..8 bits); SKY130 numbers from the committed eda-sky130rung mapped.json",
       "# Yosys 0.33, ABC 'strash; dc2; map; topo; stime', SKY130 HD tt_025C_1v80 at ORFS e5cc6e799f; latency = cycles x ABC delay", ""]

out.append("A. where the truly best design sits in each screen's order (1 = the screen would map it first)")
out.append("true objective        best    " + "  ".join(f"{s[:30]:30s}" for s in S.SCREEN))
for t, tf in S.TRUTH.items():
    best = S.order(rows, tf)[0]
    cells = [f"rank {S.optimum_rank(rows, sf, tf):2d}" for sf in S.SCREEN.values()]
    out.append(f"{t:20s}  {name(best):6s}  " + "  ".join(f"{c:30s}" for c in cells))

out += ["", "B. best true value among the screen's top k, as a ratio to the optimum (all 40 designs; k mappings paid)"]
for t, tf in S.TRUTH.items():
    out.append(f"== true objective: {t}")
    out.append("k   " + "  ".join(f"{s[:30]:30s}" for s in S.SCREEN))
    opt = min(tf(r) for r in rows)
    for k in (1, 2, 3, 5, 8, 12):
        out.append(f"{k:<3d} " + "  ".join(f"{S.best_in_top_k(rows, sf, tf, k) / opt:30.4f}" for sf in S.SCREEN.values()))

out += ["", f"C. pools of {N0} random designs of the 40, {TRIALS} draws: P(pool's true best is among the screen's top k) [Wilson 95%]",
        "   true objective = area x latency; 'random' maps k designs chosen at random (= k/n0)"]
tf = S.TRUTH["area x latency"]
out.append("k   " + "  ".join(f"{s[:30]:30s}" for s in S.SCREEN) + "  random")
for k in (1, 2, 3, 5, 8):
    cells = []
    for sf in S.SCREEN.values():
        p, _ = S.capture_probability(rows, sf, tf, N0, k, TRIALS)
        lo, hi = S.wilson(round(p * TRIALS), TRIALS)
        cells.append(f"{p:.3f} [{lo:.3f},{hi:.3f}]".ljust(30))
    out.append(f"{k:<3d} " + "  ".join(cells) + f"  {k / N0:.3f}")

out += ["", f"D. same pools, mean (best true area x latency among the k mapped) / (pool optimum)"]
out.append("k   " + "  ".join(f"{s[:30]:30s}" for s in S.SCREEN))
for k in (1, 2, 3, 5, 8):
    out.append(f"{k:<3d} " + "  ".join(f"{S.capture_probability(rows, sf, tf, N0, k, TRIALS)[1]:30.4f}" for sf in S.SCREEN.values()))

out += ["", "E. designs the generic cells x cycles screen would map first, with their true area x latency rank"]
trank = {i: r + 1 for r, i in enumerate(S.order(rows, tf))}
sf = S.SCREEN["generic cells x cycles"]
out.append("screen position -> design (true area x latency rank): " + ", ".join(f"{name(i)} ({trank[i]})" for i in S.order(rows, sf)[:8]))
sf = S.SCREEN["generic cells x cycles x depth"]
out.append("depth-aware screen:                                  " + ", ".join(f"{name(i)} ({trank[i]})" for i in S.order(rows, sf)[:8]))
out += ["", "== F. plot data: P(pool best in top k), pools of %d, area x latency" % N0, "k  analytic  cells_x_cycles  cells_x_cycles_x_depth  random"]
for k in (1, 2, 3, 4, 5, 6, 8):
    ps = [S.capture_probability(rows, sf, tf, N0, k, TRIALS)[0] for sf in S.SCREEN.values()]
    out.append(f"{k}  " + "  ".join(f"{p:.3f}" for p in ps) + f"  {k / N0:.3f}")
open(os.path.join(D, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
