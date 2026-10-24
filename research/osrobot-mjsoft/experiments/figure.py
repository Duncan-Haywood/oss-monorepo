"""Write experiments/within_budget.svg: share of feeding trials whose tissue depth stays within 30 % of the layer,
by approach speed, parsed from results.txt (15 mm lip, no arm force cap).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = {}
for l in (HERE / "results.txt").read_text().splitlines():
    if l.startswith("#") or "|" not in l:
        continue
    head, tail = (s.split() for s in l.split("|")[:2])
    if len(head) == 5 and head[1] == "15" and head[3] == "none":
        rows.setdefault(float(head[0]), []).append((float(head[2]), float(tail[5].rstrip("%"))))
series = [("E=%g kPa" % e, [v for v, _ in sorted(pts)], [s for _, s in sorted(pts)]) for e, pts in sorted(rows.items())]
write_lines(HERE, "within_budget.svg", "Feeding trials within the tissue depth limit (15 mm lip, 4 mm tip)",
            "Line plot of the percentage of simulated feeding trials in which the tip indents the lip by no more than 30 percent of its thickness, against approach speed from 0.02 to 0.2 metres per second, for lip moduli of 4, 10 and 45 kilopascals; slower approaches and stiffer tissue keep more trials within the limit",
            "approach speed (m/s)", "trials within 0.3 h (%)", series)
