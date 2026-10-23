"""Refit twin and ARX 4/4 on random training windows; write results.json/results.txt."""
import json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tankfit import *  # noqa
import nonlinear_benchmarks as nb

HERE = os.path.dirname(__file__)
K = int(os.environ.get("K", 100)); LENS = [512, 768, 896]
tr, te = nb.Cascaded_Tanks(atleast_2d=False, always_return_tuples_of_datasets=True)
tr, te = tr[0], te[0]
W = te.state_initialization_window_length
ut, yt, ue, ye = tr.u, tr.y, te.u, te.y
rng = np.random.default_rng(0)
th_full = fit_twin(ut, yt, True)
full = {"twin": score_twin(th_full, ue, ye, W), "arx": score_arx(fit_narx(ut, yt, 4, 4, 1), ue, ye, W)}
out = {"k": K, "n_train": len(ut), "full_fit": full, "by_window": {}}
L = [f"{K} random contiguous training windows per length (of {len(ut)} samples); test RMSE in V",
     f"full-trace fit: twin {full['twin']:.3f}, ARX 4/4 {full['arx']:.3f}", ""]
L.append(f"{'window':>6s} {'twin mean (sd)':>16s} {'ARX mean (sd)':>16s} {'gap mean':>9s} {'gap 2.5-97.5%':>16s} {'twin wins':>9s}")
for LEN in LENS:
    rows = []
    for a, b in windows(len(ut), LEN, K, rng):
        u, y = ut[a:b], yt[a:b]
        th = fit_twin(u, y, True)
        r = {"start": a, "twin": score_twin(th, ue, ye, W), "arx": score_arx(fit_narx(u, y, 4, 4, 1), ue, ye, W),
             "theta": [float(x) for x in th]}
        r["gap"] = r["arx"] - r["twin"]
        rows.append(r)
    res = {"rows": rows, "twin": summarize([r["twin"] for r in rows]), "arx": summarize([r["arx"] for r in rows]),
           "gap": summarize([r["gap"] for r in rows]), "share_gap_positive": float(np.mean([r["gap"] > 0 for r in rows]))}
    out["by_window"][LEN] = res
    t, x, g = res["twin"], res["arx"], res["gap"]
    L.append(f"{LEN:6d} {t['mean']:9.3f} ({t['sd']:.3f}) {x['mean']:9.3f} ({x['sd']:.3f}) {g['mean']:9.3f} "
             f"{g['lo']:7.3f} to {g['hi']:.3f} {res['share_gap_positive']:9.2f}")
    print(L[-1], flush=True)
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
