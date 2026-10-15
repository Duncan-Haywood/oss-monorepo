"""Run the harness on chip-accel's MAC engine: full grid (40 designs) then random search on the same cache.
Run: PYTHONPATH=src:../chip-accel/src python experiments/run.py   (writes eval_log.jsonl, results.txt, stage_time.png)"""
import json, os, shutil, sys
from collections import defaultdict
from eda_harness import harness as H

D = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(D, "eval_log.jsonl"); CACHE = os.path.join(D, ".cache")
for p in (LOG,):
    if os.path.exists(p): os.remove(p)
shutil.rmtree(CACHE, ignore_errors=True)
prob = H.Problem(n_vec=24)
h = H.Harness(prob, LOG, CACHE)
grid = H.run_loop(h, H.GridProposer(prob.space), 40)
rnd = H.run_loop(h, H.RandomProposer(prob.space, seed=0), 20)

out = [f"# {h.versions['yosys']}; {h.versions['iverilog']}; openroad installed: {h.versions['openroad']}",
       f"# {len(grid)} grid evaluations then {len(rnd)} random evaluations, one shared cache, 24 RTL test vectors per design", ""]
allr = grid + rnd
out.append(f"passed all stages: {sum(r['passed'] for r in grid)}/{len(grid)} (grid)")
out.append(f"random-search cache hits: {sum(r['cache_hit'] for r in rnd)}/{len(rnd)}")
fresh = [r for r in allr if not r["cache_hit"]]
tot = defaultdict(float)
for r in fresh:
    for k, v in r["stage_seconds"].items(): tot[k] += v
T = sum(tot.values())
out += ["", f"wall time by stage over {len(fresh)} uncached evaluations (total {T:.0f} s):"]
for k in H.STAGES:
    out.append(f"  {k:11s} {tot[k]:8.1f} s  {100*tot[k]/T:5.1f}%")
out += ["", "Pareto front (cells, cycles) over the grid:", "  p wb cells cycles int_acc"]
for r in H.pareto(grid):
    out.append(f"  {r['cand']['p']:d} {r['cand']['wb']:2d} {r['cells']:6d} {r['cycles']:5d} {r['int_acc']:.3f}")
out += ["", "random search (20 draws): best cells*cycles %d vs grid optimum %d" %
        (min(r["cells_x_cycles"] for r in rnd), min(r["cells_x_cycles"] for r in grid)),
        "distinct designs hit by random search: %d of 40" % len({(r['cand']['p'], r['cand']['wb']) for r in rnd})]
open(os.path.join(D, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(9, 3.4))
    ax[0].barh(H.STAGES, [tot[k] for k in H.STAGES], color="#4c78a8"); ax[0].set_xlabel("seconds (uncached evaluations)")
    ax[0].set_title("Where the wall time goes"); ax[0].invert_yaxis()
    for r in grid: ax[1].scatter(r["cells"], r["cycles"], c="#bbb", s=14)
    f = H.pareto(grid); ax[1].plot([r["cells"] for r in f], [r["cycles"] for r in f], "o-", c="#e45756", label="Pareto front")
    ax[1].set_xlabel("cells (generic gates)"); ax[1].set_ylabel("cycles"); ax[1].set_title("40-design grid"); ax[1].legend()
    fig.tight_layout(); fig.savefig(os.path.join(D, "stage_time.png"), dpi=110)
except ImportError:
    print("matplotlib missing: no figure")
