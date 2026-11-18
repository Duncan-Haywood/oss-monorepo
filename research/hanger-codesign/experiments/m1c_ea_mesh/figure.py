"""Shape error against arm-width offset on fabric D's 3 cm arm at three stretch stiffnesses (3D
sheet, converged) and the 2D chain at EA 150 N/m for scale.

    python3 experiments/m1c_ea_mesh/figure.py    (reads results.txt; stdlib only)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

FAB = "D"
rows = {}
for l in (HERE / "results.txt").read_text().splitlines():
    t = l.split()
    if len(t) == 9 and t[1] == FAB and t[0].startswith("EA"):
        rows.setdefault(t[0], []).append((float(t[2]), float(t[3]), float(t[8])))
series = []
for ea in ("40", "150", "800"):
    r = rows[f"EA{ea}_ds5mm_nz9"]
    series.append((f"3D 3 cm arm, EA {ea} N/m", [x for x, _, _ in r], [e for _, e, _ in r]))
r = rows["EA150_ds5mm_nz9"]
series.append(("2D chain, EA 150 N/m", [x for x, _, _ in r], [e for _, _, e in r]))
write_lines(HERE, "width_vs_ea_D.svg",
            "Fabric D, 3 cm arm: the unmeasured stretch stiffness moves the best width from +2.5 to +1 cm",
            "Shape error against arm width offset for the converged 3D sheet at EA 40, 150 and 800 N/m and the 2D chain, fabric D",
            "arm half width minus half shoulder (cm)", "shape error (cm RMS)", series)
