"""Milestone 6 post-hoc check (written after results.txt was read): does the side force still help or stay harmless when the gust's
disturbance torque has the opposite sign relative to its drag force?

In the inherited model the gust that pushes the vehicle sideways also makes a roll/pitch torque of a fixed sign. The attitude loop's
steady counter-torque then makes a side force that opposes the drag, so part of the wind push is cancelled for free. Where the
centre of pressure sits on the other side of the centre of mass the counter-torque flips, and the side force adds to the drag.
This script re-scores the trained designs of results.json (no retraining) with dist_sign = +1 (as trained) and -1, force on and off,
on the same 64 held-out episodes. Retraining under dist_sign = -1 is not done here.
"""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as R  # noqa: E402

P = R.P


def rescore(r):
    x = np.array(r["x"])[None]
    o = dict(arm=r["arm"], seed=r["seed"])
    for ds in (1.0, -1.0):
        for couple in (True, False):
            c = R.cond(r["arm"]); c["couple"] = couple
            J, _, out = P.score(x, R.TEST_EP, R.TEST_SEED, parts=True, dist_sign=ds, **c)
            tag = f"{'p' if ds > 0 else 'm'}_{'on' if couple else 'off'}"
            o.update({f"pos_{tag}": float(out["pos"][0]), f"late_{tag}": float(out["pos_late"][0]), f"yaw_{tag}": float(out["yaw"][0]), f"J_{tag}": float(J[0])})
    return o


if __name__ == "__main__":
    runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
    with Pool() as p:
        out = p.map(rescore, runs)
    lines = ["Post-hoc: trained designs re-scored with the gust torque's sign flipped (dist_sign -1); no retraining. 64 held-out episodes.",
             "arm      dist  pos on  pos off  on/off (per seed)                         late on/off  yaw on  J on"]
    for arm in R.ARMS:
        rs = sorted((r for r in out if r["arm"] == arm), key=lambda r: r["seed"])
        for s in ("p", "m"):
            m = lambda k: float(np.mean([r[f"{k}_{s}_on"] if not k.endswith("off") else r[f"{k[:-4]}_{s}_off"] for r in rs]))
            ratio = [r[f"pos_{s}_on"] / r[f"pos_{s}_off"] for r in rs]
            late = [r[f"late_{s}_on"] / r[f"late_{s}_off"] for r in rs]
            lines.append(f"{arm:8s} {'+1' if s == 'p' else '-1'}    {m('pos'):.3f}   {m('pos_off'):.3f}    {np.mean(ratio):.3f} ({', '.join(f'{v:.2f}' for v in ratio)})   "
                         f"{np.mean(late):.3f}        {m('yaw'):5.2f}  {m('J'):6.2f}")
    a = sorted((r for r in out if r["arm"] == "aware"), key=lambda r: r["seed"])
    z = sorted((r for r in out if r["arm"] == "nocant"), key=lambda r: r["seed"])
    for s in ("p", "m"):
        d = [x[f"J_{s}_on"] - y[f"J_{s}_on"] for x, y in zip(a, z)]
        dp = [x[f"pos_{s}_on"] - y[f"pos_{s}_on"] for x, y in zip(a, z)]
        lines.append(f"aware minus nocant, dist {'+1' if s == 'p' else '-1'}: J {np.mean(d):+.2f} (cant better in {sum(v > 0 for v in d)} of {len(d)}); "
                     f"pos {np.mean(dp):+.3f} m (cant lower in {sum(v < 0 for v in dp)} of {len(dp)})")
    open(os.path.join(HERE, "dist_sign.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "dist_sign.json"), "w"), indent=1)
    print("\n".join(lines))
