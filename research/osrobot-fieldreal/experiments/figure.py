"""Write experiments/speed_vs_rate.svg: area rate and kill against travel speed, parsed from results.txt (sweep 2).

    python3 experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows, on = [], False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("# Sweep 2"):
        on = True
    elif on and l.startswith("# Sweep 3"):
        break
    elif on and l.startswith(("inline", "scout")):
        t = l.split()  # planner, speed, 'km/h', kill, min, ha/h, ...
        rows.append((t[0], float(t[1]), float(t[3]), float(t[5])))
series = []
for pl in ("inline", "scout"):
    r = [x for x in rows if x[0] == pl]
    series.append((f"{pl}: ha/h", [x[1] for x in r], [x[3] for x in r]))
for pl in ("inline",):
    r = [x for x in rows if x[0] == pl]
    series.append(("inline: kill share", [x[1] for x in r], [x[2] for x in r]))
write_lines(HERE, "speed_vs_rate.svg", "Sourced-constant weeding robot: area rate and kill against speed",
            "Line plot of hectares per hour for inline and scout-then-treat weeding, and the inline kill share, against travel speed from 0.5 to 4 km/h; area rate rises with speed while the kill share falls from 0.65 to 0.38",
            "travel speed (km/h)", "ha/h  or  kill share", series)
