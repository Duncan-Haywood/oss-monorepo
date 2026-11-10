"""Shape error against arm-width offset on the stiffest sourced fabric (D), three model tiers.

    python3 experiments/m1_kes_fidelity/figure.py    (reads results.txt; stdlib only)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
start = next(i for i, l in enumerate(lines) if l.startswith("2. arm width"))
rows = []
for l in lines[start + 2:]:
    t = l.split()
    if len(t) != 5 or t[0] != "D":
        if rows and not l.strip():
            break
        continue
    rows.append([float(v) for v in t[1:]])
xs = [r[0] for r in rows]
series = [("2D chain", xs, [r[1] for r in rows]),
          ("3D slab arm", xs, [r[2] for r in rows]),
          ("3D 3 cm arm, whole sheet", xs, [r[3] for r in rows])]
write_lines(HERE, "err_vs_offset_D.svg",
            "Fabric D (KES B 0.125): all three tiers pick +1 cm",
            "Shape error against arm width offset for three cloth-model tiers on fabric D",
            "arm half width minus half shoulder (cm)", "shape error (cm RMS)", series)
