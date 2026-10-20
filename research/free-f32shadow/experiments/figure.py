"""Write experiments/shadow_time.svg: Lorenz divergence time against the size of a deliberate initial error.

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
start = next(i for i, l in enumerate(lines) if l.startswith("== 2. lorenz"))
xs, ys, t32 = [], [], None
for l in lines[start + 1:]:
    if l.startswith("=="):
        break
    mo = re.match(r"float64, start moved by (\S+)\s+(\S+)", l)
    if mo:
        xs.append(float(mo.group(1))); ys.append(float(mo.group(2)))
    mo = re.match(r"float32 arithmetic\s+(\S+)", l)
    if mo:
        t32 = float(mo.group(1))
assert xs and t32
write_lines(HERE, "shadow_time.svg",
            "Lorenz: time until a twin leaves the float64 trajectory",
            "Line plot: median time for a float64 run started with an error of size delta0 to differ from the reference by more than 1, falling by about 1.1 per factor e; a flat line shows float32 arithmetic matches an error near 6e-6",
            "deliberate initial error delta0 (float64 control)", "median time to |difference| > 1",
            [("float64, start moved by delta0", xs, ys), ("float32 arithmetic", [min(xs), max(xs)], [t32, t32])],
            logx=True, logy=False)
