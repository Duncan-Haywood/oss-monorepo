"""Cusick DC against lattice side at each fabric's sourced tangent stiffness (continued solves).

    python3 experiments/m3b_continuation/figure.py    (reads results.json; stdlib only)
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = json.loads((HERE / "results.json").read_text())
series = []
for f, eas in (("A", (254.0, 369.0)), ("D", (1341.0, 1896.0))):
    for ea in eas:
        pts = sorted((r["a"] * 1000, r["dc"]) for r in rows if r["f"] == f and r["ea"] == ea and r["conv"])
        series.append((f"fabric {f}, EA {ea:g} N/m", [p[0] for p in pts], [p[1] for p in pts]))
write_lines(HERE, "dc_vs_mesh_sourced.svg",
            "Simulated Cusick drape coefficient against mesh at sourced stretch stiffness",
            "Drape coefficient against triangle side in mm for the jersey A and suiting D, converged continued solves only",
            "triangle side (mm)", "drape coefficient", series)
