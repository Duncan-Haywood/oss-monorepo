"""Write experiments/figure_mac.svg and figure_fir.svg: front hypervolume against budget for each grid order, parsed from results.txt.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

lines = (HERE / "results.txt").read_text().splitlines()
for fam in ("mac", "fir"):
    start = next(k for k, l in enumerate(lines) if l.startswith(f"## {fam}:"))
    i = next(k for k in range(start, len(lines)) if lines[k].startswith("budget"))
    names = lines[i].split()[1:]
    xs, cols = [], [[] for _ in names]
    for l in lines[i + 1:]:
        if not l.strip():
            break
        toks = re.sub(r"\[[^\]]*\]", "", l).split()
        xs.append(float(toks[0]))
        for c, t in zip(cols, toks[1:]):
            c.append(float(t))
    write_lines(HERE, f"figure_{fam}.svg", f"Grid orders at equal budgets ({fam} family, 36 designs)",
                f"Line plot of the fraction of the true Pareto-front hypervolume found against designs evaluated, for six grid orders, on the {fam} design family",
                "distinct designs evaluated", "hypervolume / true-front hypervolume", [(n, xs, c) for n, c in zip(names, cols)])
