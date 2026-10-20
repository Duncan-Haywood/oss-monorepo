"""Write experiments/max_wage.svg: the hourly wage at which the n-th replica coat still costs $50, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'max_wage.svg', 'section': '== C.', 'xcol': 0, 'ycols': [2], 'names': ['max wage for a $50 coat'],
       'title': 'Garment learning: what your time can be worth and the n-th coat still cost $50',
       'alt': 'Line plot of the highest hourly wage at which the n-th home-sewn replica trench coat still costs $50 in materials plus labour, rising from about $1.5 per hour for the first coat to about $4 per hour for the hundredth',
       'xlabel': 'coats sewn so far (n)', 'ylabel': 'max wage ($/h)', 'logx': True, 'logy': False}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
