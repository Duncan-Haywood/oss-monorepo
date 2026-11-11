"""Drape coefficient against bending rigidity (x 1/4 to x 4 of the measured B) for the four fabrics,
from results.txt section 2.

    python3 experiments/m2_cusick/figure.py    (stdlib only)
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("2. bending rigidity sweep"))
facs = [0.25, 0.5, 1.0, 2.0, 4.0]
xs = [math.log2(f) for f in facs]
series = []
for l in lines[i + 2:i + 6]:
    t = l.split()
    series.append((f"fabric {t[0]}", xs, [float(x) for x in t[1:6]]))
write_lines(HERE, "dc_vs_bending.svg",
            "Simulated Cusick drape coefficient against bending rigidity",
            "Drape coefficient of the simulated Cusick test against log2 of the bending rigidity multiplier, four KES fabrics",
            "log2(B / measured B)", "drape coefficient", series)
