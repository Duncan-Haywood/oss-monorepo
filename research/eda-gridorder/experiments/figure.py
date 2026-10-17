"""Write experiments/figure.svg: hypervolume against budget for each grid order, parsed from results.txt.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
i = next(k for k, l in enumerate(lines) if l.startswith("budget"))
names = lines[i].split()[1:]
xs, cols = [], [[] for _ in names]
for l in lines[i + 1:]:
    if not l.strip():
        break
    toks = re.sub(r"\[[^\]]*\]", "", l).split()
    xs.append(float(toks[0]))
    for c, t in zip(cols, toks[1:]):
        c.append(float(t))
series = [(n, xs, c) for n, c in zip(names, cols)]
write_lines(HERE, "figure.svg", "Grid orders at equal budgets (80-design space)",
            "Line plot of the fraction of the true Pareto-front hypervolume found against designs evaluated, for lexicographic, Halton, farthest-point, random-start farthest-point, Latin and random orders",
            "distinct designs evaluated", "hypervolume / true-front hypervolume", series)
