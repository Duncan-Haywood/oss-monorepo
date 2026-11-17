"""Simulated against measured Cusick drape coefficient for Petrak et al.'s nine fabrics: this programme's
triangle-FEM tier (no fitted parameter) beside two of the paper's own Optitex columns (its best by RMSE,
and the one nearest zero bias); the "perfect agreement" series is the identity line.

    python3 experiments/m4a_measured_drape/figure.py    (reads results.json here; stdlib only)

Numbers are read from results.json, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

res = json.loads((HERE / "results.json").read_text())
codes = sorted(res["measured"], key=lambda c: res["measured"][c])
x = [res["measured"][c] for c in codes]
opt = res["optitex"]
series = [("perfect agreement", x, x),
          ("triangle FEM, 2.5 mm, lowest-energy seed", x, [res["lowest"][c] for c in codes]),
          ("Optitex, KES inputs, 0.6 cm polygons (paper)", x, [opt["KES 0.6"][int(c[1:]) - 1] for c in codes]),
          ("Optitex, FAST inputs, 0.4 cm polygons (paper)", x, [opt["FAST 0.4"][int(c[1:]) - 1] for c in codes])]
write_lines(HERE, "dc_sim_vs_measured.svg", "Cusick drape coefficient: simulated against measured, nine woven fabrics",
            "Simulated drape coefficient against the measured Cusick drape coefficient of Petrak et al. (2021)'s nine "
            "woven fabrics, for this programme's uncalibrated triangle-FEM tier and two of the paper's Optitex columns",
            "measured drape coefficient", "simulated drape coefficient", series)
