"""Milestone 25 (H6): a one-parameter correction k * pred_C, fitted on the digits MLP and tested on the transformer.

Run from this directory:  python3 run.py   (stdlib + numpy; reads ../h6_pathlength/results.json, writes results.json, results.txt)
Fit: k = geometric mean of measured/pred_C over the digits rows that are detectable or scored and not trivial
(tau < 0.3: at 3e-1 every step is skipped and C is already 0.97). The fit sees no transformer number.
Test: the transformer rows, ratio k*C/measured, against C alone (milestone 24). Also leave-one-row-out k on digits."""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(HERE, "..", "h6_pathlength", "results.json")))
d, t = res["digits"], res["transformer"]


def usable(b, trivial=0.3):
    return [r for r in b["rows"] if r["tau"] < trivial and r["measured"] > 0 and r["ci"][0] > 0 and r["pred_C"] > 0]


fit = usable(d)
ratio = np.array([r["measured"] / r["pred_C"] for r in fit])
k = float(np.exp(np.log(ratio).mean()))
loo = [float(np.exp(np.delete(np.log(ratio), i).mean())) for i in range(len(fit))]
lines = [f"fit rows (digits, detectable, tau<0.3): {[r['tau'] for r in fit]}", f"measured/C: {[round(float(x), 2) for x in ratio]}",
         f"k (geometric mean) = {k:.2f}; leave-one-out k = {[round(x, 2) for x in loo]}", ""]
out = {"k": k, "loo_k": loo, "fit_taus": [r["tau"] for r in fit], "rows": []}
lines.append("transformer   measured   C/meas   kC/meas   in [0.5,2]: C / kC")
ins = {"C": 0, "kC": 0}
n = 0
for r in t["rows"]:
    m = r["measured"]
    c, kc = r["pred_C"] / m, k * r["pred_C"] / m
    sc = "scored" if abs(m) > t["std"] else "detectable"
    ok = lambda x: 0.5 <= x <= 2
    n += 1
    ins["C"] += ok(c)
    ins["kC"] += ok(kc)
    out["rows"].append({"tau": r["tau"], "class": sc, "C_over_meas": c, "kC_over_meas": kc})
    lines.append(f"tau {r['tau']:<6.0e} {m:+.5f}  {c:7.2f}  {kc:7.2f}   {'yes' if ok(c) else 'no'} / {'yes' if ok(kc) else 'no'}   ({sc})")
lines.append(f"inside [0.5,2]: C {ins['C']} of {n}, kC {ins['kC']} of {n}")
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
