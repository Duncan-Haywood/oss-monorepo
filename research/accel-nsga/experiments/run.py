"""NSGA-II vs random search at equal unique-evaluation budgets against the exhaustive front.
Run: python3 experiments/run.py   (stdlib only; writes results.json / results.txt)"""
import json, os, random, statistics, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from accel_nsga import search as S

DEADLINES_US = [50, 200]
BUDGETS = [100, 200, 400, 800]
SEEDS = 30
models, dp = S.load_models(), S.load_dp()
res, lines = {"space_size": None, "seeds": SEEDS, "budgets": BUDGETS, "deadlines_us": DEADLINES_US, "rows": []}, []
for D in DEADLINES_US:
    sp = S.Space(models, dp, D)
    res["space_size"] = sp.size()
    allr = [(g, sp.evaluate(g)) for g in sp.all_genes()]
    feas = [x for x in allr if x[1]["ok"]]
    ref = (0.0, max(r["area"] for _, r in allr) * 1.0001, max(r["energy"] for _, r in allr) * 1.0001)
    truth = S.pareto_set(allr)
    hv_true = S.objective_hv(allr, ref)
    true_sigs = {(r["val"], r["area"], r["energy"]) for _, r in truth}
    lines.append(f"deadline {D} us: {sp.size()} designs, {len(feas)} feasible, exact front {len(truth)} designs, HV {hv_true:.4f}")
    for B in BUDGETS:
        out = {"deadline_us": D, "budget": B, "feasible": len(feas), "front": len(truth)}
        for name, fn in (("random", S.random_search), ("nsga2", S.nsga2)):
            hvs, found = [], []
            for s in range(SEEDS):
                items = fn(sp, B, random.Random(1000 * s + B))
                hvs.append(S.objective_hv(items, ref) / hv_true)
                sigs = {(r["val"], r["area"], r["energy"]) for _, r in S.pareto_set(items)}
                found.append(len(sigs & true_sigs) / len(true_sigs))
            out[name] = {"hv_ratio_mean": statistics.mean(hvs), "hv_ratio_sd": statistics.stdev(hvs),
                         "front_found_mean": statistics.mean(found), "hv_ratio_all": hvs}
        res["rows"].append(out)
        lines.append(f"  budget {B:4d} ({B / sp.size():.1%}): HV/true random {out['random']['hv_ratio_mean']:.3f}+-{out['random']['hv_ratio_sd']:.3f} "
                     f"nsga2 {out['nsga2']['hv_ratio_mean']:.3f}+-{out['nsga2']['hv_ratio_sd']:.3f} | front found random "
                     f"{out['random']['front_found_mean']:.2f} nsga2 {out['nsga2']['front_found_mean']:.2f}")
lines.append("== front found (share of exact front, mean of %d seeds)" % SEEDS)
lines.append("budget random_50us nsga2_50us random_200us nsga2_200us")
for B in BUDGETS:
    r = {x["deadline_us"]: x for x in res["rows"] if x["budget"] == B}
    lines.append(f"{B} " + " ".join(f"{r[D][n]['front_found_mean']:.3f}" for D in DEADLINES_US for n in ("random", "nsga2")))
json.dump(res, open(os.path.join(here, "results.json"), "w"), indent=1)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
