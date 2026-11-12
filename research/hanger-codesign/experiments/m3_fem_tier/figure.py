"""Cantilever tip-drop error of the FEM tier against the exact elastica, by mesh.

    python3 experiments/m3_fem_tier/figure.py    (reads results_cantilever.txt; stdlib only)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = [l.split() for l in (HERE / "results_cantilever.txt").read_text().splitlines()[2:]]
series = []
for f in ("A", "D"):
    for L in ("2", "4"):
        pts = [(int(t[3]), float(t[6])) for t in rows if len(t) == 9 and t[0] == f and t[1] == L and t[2] == "800"]
        series.append((f"fabric {f}, overhang {L} bending lengths", [p[0] for p in pts], [p[1] for p in pts]))
write_lines(HERE, "cantilever_error_vs_mesh.svg",
            "FEM cantilever tip drop against the exact elastica",
            "Tip-drop error in percent of overhang length against elements along the overhang, EA 800 N/m",
            "elements along the overhang", "tip-drop error (% of l)", series, logx=True, logy=True)
