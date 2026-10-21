"""Fit and score the models; write results.json and results.txt."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tanktwin import *  # noqa
import nonlinear_benchmarks as nb

HERE = os.path.dirname(__file__)
tr, te = nb.Cascaded_Tanks(atleast_2d=False, always_return_tuples_of_datasets=True)
tr, te = tr[0], te[0]
W = te.state_initialization_window_length  # 50 samples reserved for state initialisation
ut, yt, ue, ye = tr.u, tr.y, te.u, te.y
res = {"n_train": len(ut), "n_test": len(ue), "init_window": W,
       "train_u_range": [float(ut.min()), float(ut.max())], "test_u_range": [float(ue.min()), float(ue.max())],
       "train_y_range": [float(yt.min()), float(yt.max())], "test_y_range": [float(ye.min()), float(ye.max())],
       "share_test_y_above_train_max": float(np.mean(ye[W:] > yt.max()))}
rows = {}
preds = {}
for name, ov in (("twin (no overflow)", False), ("twin (overflow)", True)):
    th = fit_twin(ut, yt, ov)
    # test: re-estimate only the two initial states on the init window, keep physics fixed
    th_t = th.copy()
    g = lambda s: twin_sim(np.r_[th[:4], s, th[6:]] if ov else np.r_[th[:4], s], ue, ov)[:W] - ye[:W]
    from scipy.optimize import least_squares
    s = least_squares(g, th[4:6], bounds=([0, 0], [30, 30])).x
    th_t[4:6] = s
    p_tr = twin_sim(th, ut, ov); p_te = twin_sim(th_t, ue, ov)
    rows[name] = {"n_params": len(th), "train": rmse(p_tr, yt), "test": rmse(p_te[W:], ye[W:]),
                  "test_clip10": rmse(np.minimum(p_te[W:], 10.0), ye[W:]),
                  "theta": [float(x) for x in th]}
    preds[name] = p_te
for name, na, nbk, poly in (("linear ARX 2/2", 2, 2, 1), ("linear ARX 4/4", 4, 4, 1),
                            ("NARX quadratic 2/2", 2, 2, 2), ("NARX quadratic 3/3", 3, 3, 2),
                            ("NARX quadratic 4/4", 4, 4, 2)):
    m = fit_narx(ut, yt, na, nbk, poly)
    p_tr = narx_sim(m, ut, yt); p_te = narx_sim(m, ue, ye)
    k = max(na, nbk)
    rows[name] = {"n_params": len(m["w"]), "train": rmse(p_tr[k:], yt[k:]), "test": rmse(p_te[W:], ye[W:]),
                "test_clip10": rmse(np.minimum(p_te[W:], 10.0), ye[W:])}
    preds[name] = p_te
res["models"] = rows
# where does the error sit? split the test set by whether the true output is beyond the training range
mask = ye[W:] > yt.max() - 1e-9
res["test_split"] = {n: {"in_range": rmse(p[W:][~mask], ye[W:][~mask]),
                         "beyond_train_max": rmse(p[W:][mask], ye[W:][mask]) if mask.any() else None}
                     for n, p in preds.items()}
res["n_test_beyond"] = int(mask.sum())
np.save(os.path.join(HERE, "test_pred.npy"), np.vstack([ye] + [preds[k] for k in rows]))
json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
L = [f"{'model':22s} {'params':>6s} {'train RMSE':>10s} {'test RMSE':>10s} {'in-range':>9s} {'beyond':>8s} {'clip@10':>8s}"]
for n, r in rows.items():
    s = res["test_split"][n]
    L.append(f"{n:22s} {r['n_params']:6d} {r['train']:10.3f} {r['test']:10.3f} {s['in_range']:9.3f} "
             + (f"{s['beyond_train_max']:8.3f}" if s['beyond_train_max'] is not None else "     n/a") + f" {r['test_clip10']:8.3f}")
L.append(f"test samples with y above the training maximum: {res['n_test_beyond']} of {len(ye)-W}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
