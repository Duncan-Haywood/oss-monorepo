"""Write experiments/load.svg (gain of value-first dispatch over FIFO against belt density) from results.txt."""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

xs, gv, gd = [], [], []
on = False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("# A."):
        on = True
        continue
    if l.startswith("# B."):
        break
    m = on and re.match(r"density\s+(\d+)/m.*value\s+[\d.]+\s+\(([+-][\d.]+)%.*density\s+[\d.]+\s+\(([+-][\d.]+)%", l)
    if m:
        xs.append(float(m[1])); gv.append(float(m[2])); gd.append(float(m[3]))
write_lines(HERE, "load.svg", "Gain over FIFO from value-aware pick order, against belt density",
            "Line plot: percent revenue gain of value-first and value-per-second dispatch over FIFO rises from near 0 at 1 item per metre to about 5 percent at 10",
            "items per metre of belt (0.5 m/s)", "revenue gain over FIFO (%)",
            [("highest value first", xs, gv), ("value per second", xs, gd)])
