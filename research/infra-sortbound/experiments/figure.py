"""Write experiments/load.svg (share of the clairvoyant optimum reached by online rules, against belt density) from results.txt."""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

xs, f, v = [], [], []
on = False
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("# A."):
        on = True
        continue
    if l.startswith("# B."):
        break
    m = on and re.match(r"density\s+(\d+)/m.*fifo [\d.]+ \(([\d.]+)%.*value [\d.]+ \(([\d.]+)%", l)
    if m:
        xs.append(float(m[1])); f.append(float(m[2])); v.append(float(m[3]))
write_lines(HERE, "load.svg", "Share of the clairvoyant optimum reached by online pick rules, against belt density",
            "Line plot: the share of the best possible schedule's value that FIFO and highest-value-first dispatch reach falls from about 99.5 percent at 1 item per metre to about 90 and 94 percent at 10",
            "items per metre of belt (0.5 m/s)", "share of optimum value (%)",
            [("FIFO", xs, f), ("highest value first", xs, v)])
