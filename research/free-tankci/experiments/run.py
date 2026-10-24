"""Block-bootstrap the twin-vs-black-box RMSE gaps using the committed predictions of free-tanktwin."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
from tankci import *  # noqa

y, P = load(os.path.join(HERE, "..", "..", "free-tanktwin", "experiments", "test_pred.npy"))
twin = P["twin (overflow)"]
out = {"n": len(y), "rmse": {n: rmse(p, y) for n, p in P.items()},
       "autocorr_time_samples": {n: error_autocorr_time(P[n] - y) for n in
                                 ("twin (overflow)", "linear ARX 4/4", "twin (no overflow)")},
       "gaps": {}}
blocks = (1, 10, 25, 50, 100, 200)
for other in ("linear ARX 4/4", "twin (no overflow)", "linear ARX 2/2"):
    out["gaps"][other] = {str(b): paired_gap(y, twin, P[other], b) for b in blocks}
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
L = [f"n = {len(y)} test samples (4 s each); gap = RMSE(other) - RMSE(twin overflow), volts",
     "error integrated autocorrelation time (samples): " +
     ", ".join(f"{k} {v:.1f}" for k, v in out["autocorr_time_samples"].items()),
     f"{'other model':20s} {'block':>5s} {'gap':>7s} {'95% lo':>7s} {'95% hi':>7s} {'P(gap<=0)':>9s}"]
for other, d in out["gaps"].items():
    for b, r in d.items():
        L.append(f"{other:20s} {b:>5s} {r['gap']:7.3f} {r['lo']:7.3f} {r['hi']:7.3f} {r['p_le_0']:9.3f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
