"""Write experiments/kill_vs_time.svg: kill share against minutes for 1 to 3 passes at 1, 2 and 4 km/h (sweep 1).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows, on = [], False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("# Sweep 1"):
        on = True
    elif on and l.startswith("# Sweep 2"):
        break
    elif on and "pass" in l and "km/h" in l:
        t = l.split()  # n, 'pass', speed, 'km/h', kill, min, ...
        rows.append((int(t[0]), float(t[2]), float(t[4]), float(t[5])))
series = []
for kmh in (1.0, 2.0, 4.0):
    r = sorted(x for x in rows if x[1] == kmh)
    series.append((f"{kmh:g} km/h", [x[3] for x in r], [x[2] for x in r]))
write_lines(HERE, "kill_vs_time.svg", "Weeding robot: kill share against time for one to three passes",
            "Line plot of kill share against total minutes for one, two and three inline passes at 1, 2 and 4 km/h; the fast multi-pass lines sit above the slow single pass at equal time",
            "total time (min)", "kill share", series)
