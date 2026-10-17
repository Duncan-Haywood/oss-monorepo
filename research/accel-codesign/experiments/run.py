"""Sequential (model first) vs joint (exhaustive) design on measured accel-kws models x lane count.
Run: python3 experiments/run.py   (needs datapath_area.json from synth_dp.py; writes results.json/.txt)"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from accel_codesign import codesign as cd

dp = json.load(open(os.path.join(here, "datapath_area.json")))["cells"]
models = cd.load_models()
space = cd.design_space(models, dp)
DEADLINES = [2000, 3000, 5000, 8000, 12000, 20000]
DELTAS = [0.0, 0.01, 0.02, 0.03, 0.05]
KEYS = ("seg", "hidden", "wbits", "p", "cyc", "val", "test", "area", "energy")
res = {"n_models": len(models), "n_designs": len(space), "deadlines": DEADLINES, "rows": []}
lines = ["deadline | sequential (model first) vs joint (min area at val floor = seq.val - delta); designs as (segments,hidden,wbits) P"]
for D in DEADLINES:
    s = cd.sequential(space, D)
    if s is None:
        lines.append(f"{D:6d} | infeasible at P={cd.lanes_max(space)}"); continue
    row = {"deadline": D, "seq": {k: s[k] for k in KEYS}, "joint": []}
    lines.append(f"{D:6d} | seq ({s['seg']},{s['hidden']},{s['wbits']}) P={s['p']} val={s['val']:.3f} test={s['test']:.3f} cells={s['area']} {s['energy']:.1f}nJ")
    for dl in DELTAS:
        j = cd.joint_min_area(space, D, s["val"] - dl - 1e-12)
        row["joint"].append({"delta": dl, **{k: j[k] for k in KEYS}})
        lines.append(f"         d={dl:.2f}: ({j['seg']},{j['hidden']},{j['wbits']}) P={j['p']} val={j['val']:.3f} test={j['test']:.3f} cells={j['area']} {j['energy']:.1f}nJ  area x{j['area']/s['area']:.2f}")
    res["rows"].append(row)
res["fronts"] = {str(D): [(d["seg"], d["hidden"], d["wbits"], d["p"], round(d["val"], 4), d["area"], round(d["energy"], 2))
                          for d in cd.pareto(cd.feasible(space, D), ("val", "area", "energy"))] for D in DEADLINES}
for D in DEADLINES:
    lines.append(f"front(val,area,energy) deadline {D}: {len(res['fronts'][str(D)])} designs of {len(cd.feasible(space, D))} feasible")
json.dump(res, open(os.path.join(here, "results.json"), "w"), indent=1)
open(os.path.join(here, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
