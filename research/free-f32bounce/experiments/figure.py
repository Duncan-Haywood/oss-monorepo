"""Write experiments/departure.svg: collisions until a twin leaves the float64 billiard trajectory vs initial error.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
start = next(i for i, l in enumerate(lines) if l.startswith("== 1."))
xs, ys, n32 = [], [], None
for l in lines[start + 1:]:
    if l.startswith("=="):
        break
    mo = re.match(r"float64, start moved by (\S+)\s+(\S+)", l)
    if mo:
        xs.append(float(mo.group(1))); ys.append(float(mo.group(2)))
    mo = re.match(r"float32 arithmetic\s+(\S+)", l)
    if mo:
        n32 = float(mo.group(1))
assert xs and n32
write_lines(HERE, "departure.svg",
            "Billiard: collisions until a twin leaves the float64 trajectory",
            "Line plot: median number of collisions before a float64 run started delta0 away differs from the reference by more than 0.1, rising by about 1.3 per factor e of 1/delta0; a flat line shows float32 arithmetic matches an error near 5e-8",
            "deliberate initial error delta0 (float64 control)", "median collisions to |difference| > 0.1",
            [("float64, start moved by delta0", xs, ys), ("float32 arithmetic", [min(xs), max(xs)], [n32, n32])],
            logx=True, logy=False)
