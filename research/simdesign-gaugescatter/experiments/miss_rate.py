"""How often does the gauge-2 sub-search miss its narrow feasible region? Seeds 0-19, rules (laser) and free steel sheet.
Same sub-search settings as `optimise`. Writes miss_rate.json and miss_rate.txt."""
import json, os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import sub_search, OUT

def main():
    tasks = [(k, s, 2) for k in ("rules", "free") for s in range(20)]
    with Pool(4) as pool:
        res = pool.map(sub_search, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "miss_rate.json"), "w"), indent=1)
    L = ["gauge b=2 sub-search, peak measure, h=2.5 mm, seeds 0-19"]
    for k in ("rules", "free"):
        r = [x for x in res if x["kind"] == k]
        ok = sorted(x["mass_g"] for x in r if x["feasible"])
        L.append(f"{k}: infeasible (missed) {len(r)-len(ok)} of {len(r)}; feasible masses g: " + " ".join(f"{m:.2f}" for m in ok))
        L.append(f"{k}: missed seeds: {[x['seed'] for x in r if not x['feasible']]}")
    open(os.path.join(OUT, "miss_rate.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))

if __name__ == "__main__":
    main()
