"""Milestone 7j post hoc (written after results.txt was read): every lever-0 death at 45 deg comes in the first 0.4-1.5 s, before the
wind step. Is it the recovery from the random initial offset (uniform +-0.5 m per axis, poshold.OFFSET)? Re-run base at 45 deg with the
offset scaled to 0, 0.5x and 1x (the default), all else as run.py."""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util
_spec = importlib.util.spec_from_file_location("m7j", os.path.join(HERE, "run.py"))
R = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(R)   # milestone 7j: designs, sizes, constants

P = R.P
P.TILT_CMD_MAX = np.deg2rad(45.0)
L = ["Milestone 7j post hoc: base, lever 0, 45 deg tilt-command limit, 64 held-out episodes (seed 9999); diverged flights (of 384) per set",
     "with the initial horizontal offset scaled (poshold.OFFSET = 0.5 m x scale).", ""]
for geom in ("above", "below"):
    ds = [d for d in R.designs() if d[1] == geom]
    sz, g, kap = R.sizes(ds)
    for scale in (0.0, 0.5, 1.0):
        P.OFFSET = 0.5 * scale
        o = P.rollout(sz, g, kap, R.TEST_EP, R.TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=0.0, ff=1.0, ff_mode="integ")
        d = o["dead_ep"].sum(1)
        L.append(f"[{geom}] offset x{scale:g}: " + "; ".join(f"{st} {int(sum(v for v, s in zip(d, ds) if s[0] == st))}" for st in R.SETS))
    L.append("")
open(os.path.join(HERE, "offset.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
