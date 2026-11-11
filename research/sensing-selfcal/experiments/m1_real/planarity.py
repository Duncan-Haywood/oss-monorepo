"""How flat is the board that target-free BA reconstructs, and do the two cameras agree?

    python3 experiments/m1_real/planarity.py   # ~3 min; writes planarity.json
"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), "src"))
from run import load  # noqa: E402
from selfcal import selfcal, zhang  # noqa: E402

out = {}
for nk in (1, 2):
    o = {}
    for cam in ("left", "right"):
        obs, size, _ = load(cam)
        f0 = 1.3 * zhang(list(obs), size, k2=False)["f"]
        s = selfcal(obs, size, f0, nk=nk, ref=0)
        o[cam] = dict(f=s["f"], rms=s["rms"], **{"plan_" + k: v for k, v in s["planarity"].items()})
        print(nk, cam, {k: v for k, v in o[cam].items() if k != "plan_heights"}, flush=True)
    o["left_right_height_corr"] = float(np.corrcoef(o["left"]["plan_heights"], o["right"]["plan_heights"])[0, 1])
    print(nk, "left-right correlation of out-of-plane heights:", round(o["left_right_height_corr"], 3), flush=True)
    out[f"k{nk}"] = o
json.dump(out, open(os.path.join(HERE, "planarity.json"), "w"), indent=1)
