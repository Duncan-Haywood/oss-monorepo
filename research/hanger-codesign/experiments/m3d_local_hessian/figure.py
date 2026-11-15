"""Drape coefficient against triangle side at each fabric's top sourced stiffness: seed mean and the
registered lowest-energy rule, as the change from the 3.75 mm value.

    python3 experiments/m3d_local_hessian/figure.py    (reads results.json here and 3c's; stdlib only)

3.75 and 1.875 mm come from this milestone's results.json, 2.5 mm from milestone 3c's (the rule is
applied to each lattice's seven converged seeds). Numbers are read, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

new = json.loads((HERE / "results.json").read_text())["rows"]
old = [r for r in json.loads((HERE.parent / "m3c_branches" / "results.json").read_text()) if r["part"] == 1]
src = {0.00375: new, 0.0025: old, 0.001875: new}


def pick(f, ea, a, how):
    rs = [r for r in src[a] if (r["f"], r["ea"], r["a"]) == (f, ea, a) and r["conv"]]
    if how == "low":
        return min(rs, key=lambda r: r["energy"])["dc"]
    return sum(r["dc"] for r in rs) / len(rs)


xs = [3.75, 2.5, 1.875]
series = []
for f, ea, lab in (("D", 1896.0, "D 1896"), ("A", 369.0, "A 369")):
    for how, name in (("mean", "mean"), ("low", "lowest E")):
        ys = [pick(f, ea, a, how) for a in (0.00375, 0.0025, 0.001875)]
        series.append((f"{lab}, {name}", xs, [y - ys[0] for y in ys]))
write_lines(HERE, "dc_rule_vs_mesh.svg",
            "Cusick drape change with mesh at sourced stiffness (7 seeds per point)",
            "Drape coefficient change from the 3.75 mm lattice against triangle side, seed mean and lowest-energy seed",
            "triangle side (mm)", "DC minus DC at 3.75 mm", series, xticks=xs)
