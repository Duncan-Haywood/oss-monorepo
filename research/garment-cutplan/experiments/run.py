"""Experiments for garment-cutplan. Writes experiments/marker_lengths.json (cache) and results.txt.
Run: PYTHONPATH=src:../garment-markercost/src:../garment-nesting/src:../garment-teardown/src python experiments/run.py
(the first run nests 83 markers, a few minutes; later runs read the cache; --rebuild forces it)"""
import json, os, sys, time
import numpy as np
from garment_markercost import shirt, scaled, with_allowance, pattern_area_m2
from garment_nesting.raster import anneal_raster
from garment_cutplan import combos, plan, pure, one_each, full_set

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "marker_lengths.json")
SCALES, W, ALLOW, G, PLIES = (0.94, 1.0, 1.06), 140, 1.0, 4, 100
EVALS, SEEDS, CHECK_SEEDS = 100, (0, 1), (10, 11)
OUT = []
def say(s=""):
    print(s, flush=True); OUT.append(s)

SIZES = [scaled(shirt(), s) for s in SCALES]
def nest(combo, seeds):
    ps = [q for k, n in enumerate(combo) for _ in range(n) for q in SIZES[k]]
    cut = with_allowance(ps, ALLOW)
    return min(anneal_raster(cut, W, evals=EVALS, seed=s, max_len=1500.0)[1] for s in seeds)

if "--rebuild" in sys.argv or not os.path.exists(CACHE):
    t0 = time.time()
    table = {",".join(map(str, c)): nest(c, SEEDS) for c in combos(3, G)}
    json.dump(table, open(CACHE, "w"), indent=0, sort_keys=True)
    print("nested %d markers in %.0f s" % (len(table), time.time() - t0), file=sys.stderr)
raw = json.load(open(CACHE))
L = {tuple(int(v) for v in k.split(",")): float(x) for k, x in raw.items()}

say("garment-cutplan: stylised shirt in 3 sizes (linear scale %s), 1 cm seam allowance, cloth %d cm wide," % (SCALES, W))
say("markers of 1..%d garments (%d mixes), nested by garment-nesting's annealer (%d decodes, best of seeds %s)," % (G, len(L), EVALS, SEEDS))
say("plies <= %d per marker. Cloth is marker length x plies, in metres of %d cm cloth." % (PLIES, W))

pat_area = [pattern_area_m2(p) for p in SIZES]
say("\nExperiment A: do mixed markers pack tighter? length of each mix against the sum of its sizes' single-garment markers")
say("mix(S,M,L)  garments  length_cm  per_garment_cm  vs_singles_pct")
single = [L[(1, 0, 0)], L[(0, 1, 0)], L[(0, 0, 1)]]
ratios = []
for c in combos(3, G):
    base = sum(n * single[s] for s, n in enumerate(c))
    ratios.append(L[c] / base)
for c in [(1, 0, 0), (2, 0, 0), (4, 0, 0), (1, 1, 0), (1, 1, 1), (2, 1, 1), (1, 2, 1), (0, 2, 2)]:
    base = sum(n * single[s] for s, n in enumerate(c))
    say("%-11s %9d  %9.0f  %14.1f  %+13.1f" % (str(c).replace(" ", ""), sum(c), L[c], L[c] / sum(c), 100 * (L[c] / base - 1)))
say("all %d mixes: length / (sum of single-garment markers): min %.3f, median %.3f, max %.3f" % (len(L), min(ratios), np.median(ratios), max(ratios)))
say("annealing noise: the same 9-piece marker re-nested with 6 seeds spans %.0f to %.0f cm" % (
    min(nest((1, 0, 0), (s,)) for s in range(20, 26)), max(nest((1, 0, 0), (s,)) for s in range(20, 26))))

rng = np.random.default_rng(0)
orders = []
for N in (60, 150, 300):
    for _ in range(10):
        sh = rng.dirichlet([4, 6, 4])
        d = np.maximum(1, np.rint(sh * N)).astype(int)
        orders.append(tuple(int(v) for v in d))

def evals(setup):
    rows = []
    for d in orders:
        full = plan(L, d, PLIES, setup)
        pur = plan(L, d, PLIES, setup, allowed=pure)
        ones = plan(L, d, PLIES, setup, allowed=one_each)
        if full and pur and ones:
            rows.append((d, full, pur, ones))
    return rows

say("\nExperiment B: cloth to cut 30 random orders (3 totals x 10 share draws, seed 0) three ways, over the orders all three plans can cut within the ply cap. Setup cost = cm of cloth charged per marker laid.")
say("plan 'one-each' lays 1-garment markers only; 'pure' allows any single-size marker up to %d garments; 'optimal' allows every mix (exact integer program)." % G)
say("setup_cm  orders  one-each_m  pure_m  optimal_m  opt_vs_pure_pct  opt_vs_one-each_pct  markers_opt  markers_pure  mixed_markers_in_opt")
res = {}
for setup in (0, 200, 600):
    rows = evals(setup)
    res[setup] = rows
    f = lambda i: sum(r[i]["cost"] for r in rows) / 100
    one, pu, op = f(3), f(2), f(1)
    mo = np.mean([len(r[1]["markers"]) for r in rows]); mp = np.mean([len(r[2]["markers"]) for r in rows])
    mixed = np.mean([sum(1 for k, _ in r[1]["markers"] if not pure(k)) for r in rows])
    say("%8d  %6d  %10.1f  %6.1f  %9.1f  %+15.1f  %+19.1f  %11.1f  %12.1f  %20.1f" % (
        setup, len(rows), one, pu, op, 100 * (op / pu - 1), 100 * (op / one - 1), mo, mp, mixed))

say("\nExperiment C: gain of the optimal plan over the pure-size plan by order size (setup 200 cm)")
say("total_garments  orders  mean_gain_pct  min_gain_pct  max_gain_pct")
bysize = {}
for d, full, pur, _ in res[200]:
    bysize.setdefault((60 if sum(d) < 100 else 150 if sum(d) < 225 else 300), []).append(100 * (1 - full["cost"] / pur["cost"]))
for N, g in sorted(bysize.items()):
    say("%14d  %6d  %13.2f  %12.2f  %12.2f" % (N, len(g), np.mean(g), min(g), max(g)))

say("\nExperiment D: winner's curse. The planner picks markers whose annealed length happened to be short.")
say("Re-nest every marker the optimal plan used (setup 200) with fresh seeds %s and re-cost the same plan." % (CHECK_SEEDS,))
pred = real = pure_pred = pure_real = 0.0
cache = {}
def fresh(k):
    if k not in cache:
        cache[k] = nest(k, CHECK_SEEDS)
    return cache[k]
for d, full, pur, _ in res[200]:
    pred += full["fabric"]; real += sum(fresh(k) * p for k, p in full["markers"])
    pure_pred += pur["fabric"]; pure_real += sum(fresh(k) * p for k, p in pur["markers"])
say("optimal plan: predicted %.1f m, re-nested %.1f m (%+.2f%%)" % (pred / 100, real / 100, 100 * (real / pred - 1)))
say("pure plan:    predicted %.1f m, re-nested %.1f m (%+.2f%%)" % (pure_pred / 100, pure_real / 100, 100 * (pure_real / pure_pred - 1)))
say("optimal vs pure after re-nesting: %+.2f%% (before: %+.2f%%)" % (100 * (real / pure_real - 1), 100 * (pred / pure_pred - 1)))

say("\nExperiment E: ply cap. Same 30 orders, setup 200, optimal plan, cloth in metres against the maximum plies per marker")
say("max_plies  feasible_orders  cloth_per_garment_demanded_cm  markers_per_order")
for P in (20, 50, 100):
    rs = [(d, plan(L, d, P, 200)) for d in orders]
    ok = [(d, r) for d, r in rs if r]
    say("%9d  %15d  %30.1f  %17.1f" % (P, len(ok), sum(r["cost"] for d, r in ok) / sum(sum(d) for d, r in ok),
                                      np.mean([len(r["markers"]) for d, r in ok]) if ok else float("nan")))

IDX = len(res[200]) // 2
say("\nExample order %s, setup 200: optimal plan" % (res[200][IDX][0],))
r = res[200][IDX][1]
for k, p in sorted(r["markers"], key=lambda t: -t[1]):
    say("  mix %s x %d plies (%.0f cm marker)" % (str(k).replace(" ", ""), p, L[k]))
say("  cut %s for demand %s, cloth %.1f m (pure plan: %.1f m)" % (r["cut"], res[200][IDX][0], r["fabric"] / 100, res[200][IDX][2]["fabric"] / 100))
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(OUT) + "\n")
