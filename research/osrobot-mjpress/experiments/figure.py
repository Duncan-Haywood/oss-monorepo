"""Write experiments/area_needed.svg: contact area needed for the worst trial to meet a pressure limit, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = {}
part = 0
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("# Part"):
        part = int(line.split()[2].rstrip(":"))
    if line.startswith("#") or part != 2:
        continue
    t = line.split()
    rows[(int(t[0]), float(t[1]))] = [float(x) for x in t[2:]]
xs = [0.02, 0.05, 0.10, 0.20]
series = [("b=%d, limit %d N/cm2" % (b, p), xs, [rows[(b, v)][i] for v in xs])
          for b in (4, 1000) for i, p in ((0, 20), (2, 110))]
write_lines(HERE, "area_needed.svg", "Contact area the worst trial needs to stay within a pressure limit",
            "Line plot of the contact area in square centimetres that the worst of 200 camera-arm trials needs so that its peak force stays under a pressure limit of 20 or 110 newtons per square centimetre, against approach speed in metres per second, at contact damping 4 and 1000",
            "approach speed (m/s)", "area needed (cm2)", series)
