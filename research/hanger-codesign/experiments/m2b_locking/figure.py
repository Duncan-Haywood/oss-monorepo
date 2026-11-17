"""Simulated Cusick drape coefficient against grid spacing, fabrics A and D at three stretch
stiffnesses.

    python3 experiments/m2b_locking/figure.py    (reads results.txt; stdlib only)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("fabric EA DC@"))
hs = [float(t[3:-2]) for t in lines[i].split()[2:]]
series = []
for l in lines[i + 1:]:
    t = l.split()
    if len(t) != 2 + len(hs):
        break
    series.append((f"fabric {t[0]}, EA {t[1]} N/m", hs, [float(x) for x in t[2:]]))
write_lines(HERE, "dc_vs_mesh.svg",
            "Simulated Cusick drape coefficient against grid spacing",
            "Drape coefficient against spring-grid spacing for fabrics A and D at EA 150, 800 and 3200 N/m",
            "grid spacing h (mm)", "drape coefficient", series)
