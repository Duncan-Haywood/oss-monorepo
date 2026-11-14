"""Milestone 7j, post hoc (written after results.txt was read): what in the retrained `above` designs sets the lever-0 45 deg
tilt-over? results.txt: every one dies in the first 0.8 s (the pull-in from the initial offset), with the mixer scaling roll/pitch on
most alive steps, on the slowest-motor plants; the ideal mixer or half position gains remove all of them, re-sizing at thrust-to-weight
2.0 none. Here, per design (24 `above`, 24 `below`): position kp and kd, the tilt a 1 m offset asks for (kp / g, deg), attitude kp and kd,
and the Spearman rank correlation of each with the design's diverged flights at 45 deg, lever 0. Also the initial offset of the
diverged episodes against all. Reads results.json; writes posthoc.txt."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import aero as A, poshold as P  # noqa: E402

R = json.load(open(os.path.join(HERE, "results.json")))
pr = lambda a: np.argsort(np.argsort(a)).astype(float)
spear = lambda a, b: float(np.corrcoef(pr(np.asarray(a)), pr(np.asarray(b)))[0, 1])
off = P.reference(R["episodes"], R["test_seed"])[5]
L = ["Milestone 7j post hoc: design gains against diverged flights at 45 deg, lever 0 (Spearman over the 24 designs per geometry).", ""]
for geom in ("above", "below"):
    o = next(r for r in R["runs"] if r["geom"] == geom and r["cap"] == 45.0 and r["lever"] == 0.0 and r["probe"] == "base")
    des = sorted((r for r in json.load(open(os.path.join(HERE, "..", "m7i_aware", "results.json")))["runs"] if r["geom"] == geom and r["label"] in R["sets"]),
                 key=lambda r: (R["sets"].index(r["label"]), r["seed"]))
    x = np.array([d["x"] for d in des]); g = P.phys_gains(x[:, 3:12])
    dead = np.asarray(o["dead"]).sum(1)
    cols = {"pos kp": g[:, 6], "pos kd": g[:, 7], "pos ki": g[:, 8], "att kp": g[:, 0], "att kd": g[:, 1], "att ki": g[:, 2],
            "tau_max": np.array(o["tau_max"]), "lag": np.array(o["lag"]), "mass": np.array(o["mass"])}
    L.append(f"[{geom}] diverged flights per design: {dead.tolist()}")
    for lab in R["sets"]:
        i = [k for k, d in enumerate(des) if d["label"] == lab]
        L.append(f"  {lab}: " + "; ".join(f"{k} {np.mean(v[i]):.3g}" for k, v in cols.items()) + f"; dead {int(dead[i].sum())}")
    L.append("  Spearman with dead: " + "; ".join(f"{k} {spear(v, dead):+.2f}" for k, v in cols.items()))
    D = np.asarray(o["dead"]).astype(bool)
    ep = sorted(set(np.nonzero(D)[1].tolist()))
    if ep:
        mag = np.abs(off).max(1)
        L.append(f"  initial offset (largest axis, m) of diverged episodes {np.median(mag[ep]):.2f} (median; all {np.median(mag):.2f}, max {mag.max():.2f})")
    L.append("")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
