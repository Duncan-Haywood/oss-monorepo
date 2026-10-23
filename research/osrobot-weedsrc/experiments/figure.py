"""Write experiments/kill_vs_time.svg: kill share against minutes for 1 to 3 passes at 1, 2 and 4 km/h, assumed (A) and fitted (B) detector (sweep 1).

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
    elif on and " pass " in l and "km/h" in l:
        t = l.split()  # det, n, 'pass', speed, 'km/h', kill, min, ...
        rows.append((t[0], int(t[1]), float(t[3]), float(t[5]), float(t[6])))
series = []
for det, name in (("A", "assumed detector"), ("B", "fitted detector")):
    for kmh in (1.0, 2.0, 4.0):
        r = sorted(x for x in rows if x[0] == det and x[2] == kmh)
        series.append((f"{name}, {kmh:g} km/h", [x[4] for x in r], [x[3] for x in r]))
write_lines(HERE, "kill_vs_time.svg", "Weeding robot: kill share against time, assumed against published-rate detector",
            "Line plot of kill share against total minutes for one to three passes at 1, 2 and 4 km/h under an assumed detector and one fitted to two published detection rates; the fitted detector kills far more at every time",
            "total time (min)", "kill share", series)
