"""Write experiments/lumber_vs_span.svg: truss against stick-framed lumber per sq ft, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'lumber_vs_span.svg', 'section': 'A. Lightest passing truss', 'xcol': 0, 'ycols': [5, 8], 'names': ['W truss, 24 in o.c.', 'rafters + ceiling joists, 16 in o.c.'], 'title': 'Roof lumber per sq ft of plan, 30 psf snow, 4/12 (stylised)', 'alt': 'Line plot of nominal board feet per square foot of plan for the lightest passing W truss and for stick-framed rafters plus ceiling joists, against span from 12 to 30 feet; the truss uses roughly half the lumber', 'xlabel': 'span (ft)', 'ylabel': 'board feet per sq ft of plan', 'logx': False, 'logy': False, 'maxrows': None}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
