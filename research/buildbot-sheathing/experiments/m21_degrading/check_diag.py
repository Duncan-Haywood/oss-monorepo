"""Milestone 21 diagnostics for the two refuted code checks (run after run.py; prints to stdout).

H99 as scripted recomputed s = 1 - E/E_t from the spring's history without the rule's "never rises" clamp
(s = running minimum). This recomputes it with the clamp. H98's monotonic check: count the springs that reverse
during a monotonic push of each wall at gamma 5 (they are the ones the rule degrades)."""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import wall_cyclic as C  # noqa: E402

S = C.anderson(115)
amps, _ = C.curee(2 * S.Du, 3.0)
h = C.cycle_path(amps, S.Du / 50)
sg = S.degrading(10.0)
st = sg.init_state(1)
Fprev = dprev = E = dirn = 0.0
rev = False
s_min = 1.0
worst_s = worst_F = 0.0
for d in h:
    s_used, y_prev = st["s"][0], st["yielded"][0]
    F, _, st = sg.trial(np.array([d]), st)
    if st["env"][0] != 0 and not st["dead"][0]:
        worst_F = max(worst_F, abs(F[0] - s_used * sg.env_odd(d)[0]))
    inc = d - dprev
    if y_prev and np.sign(inc) * dirn < 0:
        rev = True
    if rev:
        E += 0.5 * (Fprev + F[0]) * inc
    dirn = np.sign(inc) if inc != 0 else dirn
    Fprev, dprev = F[0], d
    s_min = min(s_min, min(1.0, max(0.0, 1 - max(E, 0) / (10.0 * sg.FU * sg.Du))))
    worst_s = max(worst_s, abs(st["s"][0] - s_min))
print(f"H99 with the clamp: largest |F - s E(d)| on the envelope {worst_F / S.FU:.1e} FU; largest |s - s_hand| "
      f"{worst_s:.1e}")

if "--walls" in sys.argv:
    sys.argv.remove("--walls")
    import runpy
    g = runpy.run_path(os.path.join(HERE, "run.py"), run_name="m21")
    out = {}
    for e in (6.0, 3.0):
        for dc in (False, True):
            cw = g["build"](e, dc, 1.0, 5.0)
            L, _ = cw.drive(np.arange(1, 301) * g["STEP"])
            s = cw.st["s"]
            out[f"{e:.0f}-{'d' if dc else 'c'}"] = {"reversed": int(cw.st["rev"].sum()), "springs": int(s.size),
                                                     "s_min": float(s.min()), "peak": float(L.max() / S.FU)}
            print(e, dc, out[f"{e:.0f}-{'d' if dc else 'c'}"], flush=True)
    json.dump(out, open(os.path.join(HERE, "check_diag.json"), "w"), indent=1)
