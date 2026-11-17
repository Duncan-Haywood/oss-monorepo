"""Milestone 7x, post hoc (not predicted): which certificate corner binds on each new design? For each 52 and 60 ms design, the
margin radius over the floor/2x-floor corners alone and over the 33 ms corners alone, under its training law. If the 33 ms
corners never set the radius, the new constraint is slack and 7x differs from 7w only in the floor."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0]]
import importlib.util
spec = importlib.util.spec_from_file_location("m7x", os.path.join(HERE, "run.py"))
X = importlib.util.module_from_spec(spec); spec.loader.exec_module(X)
A, LS, H, R, L7 = X.A, X.LS, X.H, X.R, X.U.L7
designs = [d for d in json.load(open(os.path.join(HERE, "results.json")))["designs"] if d["label"] in X.FLOORS]
R.set_closure("src_li")
L = [__doc__.strip().splitlines()[0]]
n_bind = 0
for d in designs:
    fl = X.FLOORS[d["label"]]
    x = np.array(d["x"][:12])[None]
    L7.setup(None, d["kp_hi"])
    X.patch(fl)
    full = list(LS.PLANT_CORNERS)
    LS.PLANT_CORNERS[:] = [p for p in full if abs(p[2] * fl - X.FAST) > 1e-12]
    r_slow = float(H.margin_rho(x, np.full(1, A.TWR))[0])
    LS.PLANT_CORNERS[:] = [p for p in full if abs(p[2] * fl - X.FAST) <= 1e-12]
    r_fast = float(H.margin_rho(x, np.full(1, A.TWR))[0])
    X.patch(None)
    L7.setup()
    n_bind += r_fast > r_slow + 1e-9; n_tie = locals().get("n_tie", 0) + (abs(r_fast - r_slow) <= 1e-9)
    L.append(f"  {d['label']} {d['geom']} seed {d['seed']}: rho floor corners {r_slow:.5f}, 33 ms corners {r_fast:.5f}" + ("  <- 33 ms binds" if r_fast > r_slow + 1e-9 else "  (equal: a lag-insensitive mode sets it)" if abs(r_fast - r_slow) <= 1e-9 else ""))
L.append(f"33 ms corners alone set the radius on {n_bind} of {len(designs)} designs; equal to 1e-9 on {n_tie}; floor corners set it on the rest")
open(os.path.join(HERE, "corner_bind.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
