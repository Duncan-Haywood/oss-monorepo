"""Writes experiments/err_vs_offset.svg from the committed results.txt: shape error against arm width.

python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

OFFS = [-2, -1, 0, 1, 2, 3, 4]
S = []
for l in (HERE / "results.txt").read_text().splitlines():
    head, _, errs = l.partition(" | ")
    p = head.split()
    if errs and p[3] == "40":
        S.append((f"fabric {p[0]} (B {p[1]}, W {p[2]})", OFFS, [float(e) for e in errs.split()]))
write_lines(HERE, "err_vs_offset.svg", "Shape error against arm half width past the half shoulder, EA 40 N/m (M tee shape, four KES fabrics)",
            "Line plot of shape error against arm half width relative to the half shoulder for four fabrics with published bending rigidity and weight at stretch stiffness 40 N/m; all minimise at plus 1 cm, the heaviest woven fabric nearly ties at plus 2 cm",
            "arm half width minus half shoulder (cm)", "shape error (cm RMS)", S)
