"""Simulated against measured Cusick drape coefficient for Petrak et al.'s nine fabrics: milestone 4a's
isotropic triangle FEM beside milestone 4b's orthotropic one (warp/weft bending and stretch kept apart),
both with no fitted parameter, seed 0, 2.5 mm; the "y = x" series is perfect agreement.

    python3 experiments/m4b_orthotropic/figure.py    (reads results.json here; stdlib only)

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
s0 = res["seed0"]
series = [("y = x", x, x),
          ("isotropic (4a)", x, [res["iso_seed0"][c] for c in codes]),
          ("orthotropic B only", x, [s0["bend"][c] for c in codes]),
          ("orthotropic B and EA", x, [s0["both"][c] for c in codes])]
write_lines(HERE, "dc_ortho_vs_measured.svg", "Cusick drape coefficient: isotropic and orthotropic FEM against measured",
            "Simulated drape coefficient against the measured Cusick drape coefficient of Petrak et al. (2021)'s nine "
            "woven fabrics, for the isotropic triangle FEM of milestone 4a and the orthotropic element of milestone 4b",
            "measured drape coefficient", "simulated drape coefficient", series)
