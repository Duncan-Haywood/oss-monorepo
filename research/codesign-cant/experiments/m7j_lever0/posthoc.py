"""Milestone 7j post hoc (written after results.txt was read): do the designs that tip over at lever 0, 45 deg, carry stiffer
position loops or softer attitude loops than 7e's? Physical gains per design, and the rank correlation with base deaths at 45 deg."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import poshold as P  # noqa: E402

R = json.load(open(os.path.join(HERE, "results.json")))
SETS = ("7e", "7h free", "aware TWR=2.0", "aware TWR free")
rs = [r for r in json.load(open(os.path.join(HERE, "..", "m7i_aware", "results.json")))["runs"] if r["label"] in SETS]
names = ("att kp", "att kd", "att ki", "pos kp", "pos kd", "pos ki")
cols = (0, 1, 2, 6, 7, 8)


def rank(a):
    return np.argsort(np.argsort(a)).astype(float)


L = ["Milestone 7j post hoc: physical gains (attitude kp, kd, ki: shares of the torque limit per rad, rad/s, rad s; position kp 1/s^2, kd 1/s, ki 1/s^3),",
     "mean over 6 seeds per set; rho = Spearman rank correlation, over the 24 designs of a geometry, of the gain with base deaths at lever 0, 45 deg.", ""]
for geom in ("above", "below"):
    base = next(o for o in R["runs"] if o["geom"] == geom and o["cap"] == 45.0 and o["probe"] == "base")
    dead = {(s, sd): int(np.sum(d)) for s, sd, d in zip(base["sets"], base["seeds"], base["dead"])}
    g = {(r["label"], r["seed"]): P.phys_gains(np.asarray(r["x"][:12])[None, 3:12])[0] for r in rs if r["geom"] == geom}
    for st in SETS:
        G = np.array([g[(st, s)] for s in range(6)])
        L.append(f"[{geom}, {st}] " + "; ".join(f"{n} {G[:, c].mean():.3g}" for n, c in zip(names, cols)) + f"; deaths {[dead[(st, s)] for s in range(6)]}")
    keys = sorted(g); y = np.array([dead[k] for k in keys], float)
    L.append(f"  rho over 24 designs: " + "; ".join(f"{n} {np.corrcoef(rank(np.array([g[k][c] for k in keys])), rank(y))[0, 1]:+.2f}" for n, c in zip(names, cols)))
    L.append("")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
