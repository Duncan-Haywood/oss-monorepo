"""Sweep NSGA-II population size and mutation rate (and drop crossover) on accel-nsga's space, against the exact front.
Run: python3 experiments/run.py   (stdlib only; writes results.json / results.txt)"""
import json, os, random, statistics, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from accel_nsgatune import tune as T
S = T.S

DEADLINES_US = [50, 200]
BUDGET = 400
SEEDS = 30
POPS = [10, 20, 40, 80]
MUTS = [0.02, 0.05, 0.1, 0.25, 0.5]
models, dp = S.load_models(), S.load_dp()
res, lines = {"budget": BUDGET, "seeds": SEEDS, "rows": []}, []


def score(items, ref, hv_true, true_sigs):
    sigs = {(r["val"], r["area"], r["energy"]) for _, r in S.pareto_set(items)}
    return len(sigs & true_sigs) / len(true_sigs), S.objective_hv(items, ref) / hv_true


for D in DEADLINES_US:
    sp = S.Space(models, dp, D)
    allr = [(g, sp.evaluate(g)) for g in sp.all_genes()]
    ref = (0.0, max(r["area"] for _, r in allr) * 1.0001, max(r["energy"] for _, r in allr) * 1.0001)
    truth = S.pareto_set(allr)
    hv_true = S.objective_hv(allr, ref)
    true_sigs = {(r["val"], r["area"], r["energy"]) for _, r in truth}
    configs = [("random", None, None, None)] + [("nsga2", p, m, True) for p in POPS for m in MUTS] + \
              [("nsga2-nocross", p, m, False) for p in (20, 40) for m in MUTS]
    lines.append(f"deadline {D} us: exact front {len(truth)} designs; budget {BUDGET}, {SEEDS} seeds")
    for name, p, m, cx in configs:
        fs, hs = [], []
        for s in range(SEEDS):
            rng = random.Random(1000 * s + BUDGET)
            items = S.random_search(sp, BUDGET, rng) if name == "random" else T.nsga2_x(sp, BUDGET, rng, p, m, cx)
            f, h = score(items, ref, hv_true, true_sigs)
            fs.append(f); hs.append(h)
        row = {"deadline_us": D, "method": name, "pop": p, "mut": m, "front_found_mean": statistics.mean(fs),
               "front_found_sd": statistics.stdev(fs), "hv_ratio_mean": statistics.mean(hs)}
        res["rows"].append(row)
        lines.append(f"  {name:14s} pop {str(p):>4s} mut {str(m):>4s}: front found {row['front_found_mean']:.3f}+-{row['front_found_sd']:.3f} HV {row['hv_ratio_mean']:.3f}")
lines.append("== front found by mutation rate (pop 20 and 80, with crossover, mean of %d seeds)" % SEEDS)
lines.append("mut pop20_50us pop80_50us pop20_200us pop80_200us")
for m in MUTS:
    get = lambda D, p: next(r for r in res["rows"] if r["deadline_us"] == D and r["method"] == "nsga2" and r["pop"] == p and r["mut"] == m)["front_found_mean"]
    lines.append(f"{m} " + f"{get(50,20):.3f} {get(50,80):.3f} {get(200,20):.3f} {get(200,80):.3f}")
json.dump(res, open(os.path.join(here, "results.json"), "w"), indent=1)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
