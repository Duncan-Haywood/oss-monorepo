"""Write experiments/feasible_vs_h.svg: feasible widths per fillet radius against mesh size, from meshscan.txt.

    python experiments/figure.py

Numbers are parsed from the committed meshscan.txt, never retyped: re-run meshscan.py first if the experiment changes.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def counts(text):
    """{r: ([h], [feasible widths])}; 'none feasible' is 0."""
    out = {}
    for l in text:
        m = re.match(r"h=([\d.]+) r=\s*([\d.]+): (\d+|none) feasible", l)
        if m:
            h, r, n = float(m.group(1)), float(m.group(2)), m.group(3)
            xs, ys = out.setdefault(r, ([], []))
            xs.append(h)
            ys.append(0.0 if n == "none" else float(n))
    if not out:
        raise SystemExit("no rows parsed from meshscan.txt")
    return out


def main():
    data = counts((HERE / "meshscan.txt").read_text().splitlines())
    series = [(f"r = {r:g} mm", xs, ys) for r, (xs, ys) in sorted(data.items())]
    write_lines(HERE, "feasible_vs_h.svg", "Feasible bracket widths shrink as the mesh is refined",
                "Line plot of the number of feasible bracket widths in the 0.1 mm scan for four fillet radii against "
                "mesh size h; the count falls toward zero as h decreases",
                "mesh size h (mm), logarithmic", "feasible widths (of the 0.1 mm scan)", series, logx=True)


if __name__ == "__main__":
    main()
