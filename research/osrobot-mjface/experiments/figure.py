"""Write experiments/peak_force.svg: blocked-arm impact peak against approach speed, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = {}
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("#"):
        continue
    t = line.split()
    if len(t) == 6:
        rows[(int(t[0]), int(t[1]))] = [float(x) for x in t[2:]]
xs = [0.02, 0.05, 0.10, 0.20]
write_lines(HERE, "peak_force.svg", "Blocked feeding arm: MuJoCo impact peak against approach speed",
            "Line plot of the peak contact force in newtons against approach speed in metres per second for the assumed lip stiffness of 800 newtons per metre and the ISO/TS 15066 face stiffness of 75,000 newtons per metre, at three contact dampings",
            "approach speed (m/s)", "peak contact force (N)",
            [("k=800, b=4 (mjfeed)", xs, rows[(800, 4)]), ("k=75000, b=4", xs, rows[(75000, 4)]),
             ("k=75000, b=100", xs, rows[(75000, 100)]), ("k=75000, b=1000", xs, rows[(75000, 1000)])])
