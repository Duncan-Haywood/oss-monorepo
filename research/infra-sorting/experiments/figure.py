"""Write experiments/speed.svg (recovery and picks/min against belt speed) from results.txt."""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

xs, rec, pm = [], [], []
on = False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("# A."):
        on = True
        continue
    if l.startswith("# B."):
        break
    m = on and re.match(r"speed\s+([\d.]+) m/s\s+purity\s+\S+.*?recovery\s+([\d.]+).*picks/min\s+([\d.]+)", l)
    if m:
        xs.append(float(m[1])); rec.append(float(m[2])); pm.append(float(m[3]) / 20.0)
write_lines(HERE, "speed.svg", "Pick cell: recovery against belt speed (1 s pick, 1 m reach)",
            "Line plot: share of target items recovered falls from 0.66 at 0.1 m/s to zero at 1.5 m/s; picks per minute divided by 20 rises then collapses",
            "belt speed (m/s)", "recovery (and picks/min / 20)",
            [("recovery", xs, rec), ("picks per min / 20", xs, pm)])
