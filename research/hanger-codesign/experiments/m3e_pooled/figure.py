"""Drape coefficient against triangle side at each fabric's garment-load stiffness, one solver on every
lattice: seed mean, lowest-energy own seed, and the registered pooled cross-mesh rule, as the change
from the 3.75 mm value.

    python3 experiments/m3e_pooled/figure.py    (reads results.json here; stdlib only)

Numbers are read from results.json, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

res = json.loads((HERE / "results.json").read_text())
TOP = {"A": 369.0, "D": 1896.0}
LATS = ((0.00375, "3.75"), (0.0025, "2.5"), (0.001875, "1.875"))


def own_low(f, a):
    rs = [r for r in res["rows"] if (r["f"], r["a"], r["ea"]) == (f, a, TOP[f]) and r["conv"]]
    # D at 1.875 mm reran seeds 0 to 2 only; 3d's seeds 3 to 6 there share those three states' energies
    return min(rs, key=lambda r: r["energy"])["dc"]


xs = [3.75, 2.5, 1.875]
series = []
for f in ("D", "A"):
    for name, get in (("seed mean", lambda f, a, m: res["seed_mean"][f"{f} {m}"]),
                      ("lowest own seed", lambda f, a, m: own_low(f, a)),
                      ("pooled lowest", lambda f, a, m: res["pooled"][f"{f} {m}"]["dc"])):
        ys = [get(f, a, m) for a, m in LATS]
        series.append((f"{f} {TOP[f]:g}, {name}", xs, [y - ys[0] for y in ys]))
write_lines(HERE, "dc_pooled_vs_mesh.svg",
            "Cusick drape change with mesh, one solver, garment-load stiffness",
            "Drape coefficient change from the 3.75 mm lattice against triangle side: seed mean, lowest-energy "
            "own seed and the pooled cross-mesh lowest-energy rule",
            "triangle side (mm)", "DC minus DC at 3.75 mm", series, xticks=xs)
