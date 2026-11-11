"""Milestone 6 check (unplanned): does milestone 1's board bend survive a better corner
localiser? All-view target-free k1 fit per camera and detector; flatness of the free
corners, the left/right correlation of their out-of-plane heights, and the flat-board
(Zhang) vs free-board c_y gap. Writes bend.json.

    python3 experiments/m6_detector/bend.py      # ~1 min
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, HERE)
from selfcal import selfcal_fixed_analytic, zhang, zhang_ro, planarity  # noqa: E402
from run import load, METHODS  # noqa: E402

M2 = json.load(open(os.path.join(ROOT, "experiments", "m2_spread", "results.json")))
out = {}
for m in METHODS:
    out[m] = {}
    H = {}
    for cam in ("left", "right"):
        obs, size, _ = load(cam, m)
        f0 = M2["init_factor"] * M2["cams"][cam]["zhang_k1"]["f"]
        best = None
        for ref in (0, len(obs) // 2):
            s = selfcal_fixed_analytic(obs, size, f0, nk=1, ref=ref)
            if best is None or s["cost"] < best["cost"]:
                best = s
        z = zhang(list(obs), size, k2=False)
        ro = zhang_ro(list(obs), size, k2=False)
        pl = best["planarity"]
        H[cam] = np.array(pl["heights"])
        out[m][cam] = dict(planarity_rms=pl["rms"], planarity_max=pl["max"], cy_free=best["cy"], scy_free=best["scy"],
                           cy_flat=float(z["cy"]), scy_flat=float(z["scy"]), cy_ro=float(ro["cy"]),
                           f_free=best["f"], f_flat=float(z["f"]), cy_gap_sigma=(best["cy"] - z["cy"]) / z["scy"])
    out[m]["height_corr_left_right"] = float(np.corrcoef(H["left"], H["right"])[0, 1])
    print(m, {c: {k: round(v, 4) for k, v in out[m][c].items()} for c in ("left", "right")},
          "corr", round(out[m]["height_corr_left_right"], 3), flush=True)
json.dump(out, open(os.path.join(HERE, "bend.json"), "w"), indent=1)
