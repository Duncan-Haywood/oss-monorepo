"""Milestone 20, H93: ``wall_cyclic.Saws`` against OpenSees' ``SAWSMaterial`` (the port of Folz's SAWS code).

    python -m venv ops && ops/bin/pip install openseespy numpy
    ops/bin/python experiments/m20_cyclic/ops_check.py

Drives one spring through the CUREE basic history (Krawinkler et al. 2001) with delta = 2 Du up to the 3.0 delta
primary, at two step sizes, for Anderson et al. (2007)'s four nail rows and Folz and Filiatrault's set, and writes
ops_check.json beside this file (the differences, in units of FU). Also writes the short reference trace that
tests/test_wall_cyclic.py checks against (tests/data/saws_opensees.json), so the test runs without OpenSees.
"""
import json
import os
import platform
import sys

import numpy as np
import openseespy.opensees as ops

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import wall_cyclic as C  # noqa: E402


def opensees_run(s, hist):
    ops.wipe()
    ops.model("basic", "-ndm", 1, "-ndf", 1)
    ops.uniaxialMaterial("SAWS", 1, s.F0, s.FI, s.Du, s.K0, s.r1, s.r2, s.r3, s.r4, s.alpha, s.beta)
    ops.testUniaxialMaterial(1)
    out = np.zeros(len(hist))
    for i, d in enumerate(hist):
        ops.setStrain(float(d))
        out[i] = ops.getStress()
    return out


SETS = {f"anderson {f} ksi": C.anderson(f) for f in (87, 115, 145, 241)}
SETS["folz-filiatrault"] = C.folz_filiatrault()
res = {"versions": {"python": platform.python_version(), "numpy": np.__version__}, "rows": []}
for name, s in SETS.items():
    amps, _ = C.curee(2 * s.Du, max_amp=3.0)
    for frac in (0.02, 0.005):
        hist = C.cycle_path(amps, frac * s.Du)
        mine = s.run(hist)
        theirs = opensees_run(s, hist)
        d = (mine - theirs) / s.FU
        row = {"set": name, "step_over_Du": frac, "points": len(hist), "rms": float(np.sqrt((d ** 2).mean())),
               "max": float(np.abs(d).max()), "FU_N": float(s.FU)}
        res["rows"].append(row)
        print(row)
res["max_rms"] = max(r["rms"] for r in res["rows"])
res["held"] = res["max_rms"] <= 0.02
json.dump(res, open(os.path.join(HERE, "ops_check.json"), "w"), indent=1)

# short reference trace for the unit test
s = C.anderson(115)
amps, _ = C.curee(2 * s.Du, max_amp=2.0)
hist = C.cycle_path(amps, 0.05 * s.Du)
ref = {"set": "anderson 115 ksi", "d": hist.tolist(), "F": opensees_run(s, hist).tolist()}
json.dump(ref, open(os.path.join(HERE, "..", "..", "tests", "data", "saws_opensees.json"), "w"))
print("H93 (rms within 2% of FU):", "held" if res["held"] else "refuted", res["max_rms"])
