"""Write experiments/cost_vs_signal.svg: urgent and normal cost against signal cost, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'cost_vs_signal.svg', 'section': '== B. reader', 'xcol': 0, 'ycols': [4, 5, 7], 'names': ['urgent', 'normal', 'everyone'], 'title': 'Signal-reading robots: cost per encounter against signal cost', 'alt': 'Line plot of urgent, normal and overall cost per door encounter against the cost of sending an urgency signal, 30 percent robots; urgent people never get near the 0.68 they reach with perfect reading', 'xlabel': 'signal cost c', 'ylabel': 'cost per encounter', 'logx': False, 'logy': False, 'maxrows': 8}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
