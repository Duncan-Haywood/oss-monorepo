"""Write experiments/entrant_regret.svg: an admitted module's regret against its bound, parsed from results.txt (E5).

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run the experiment first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'entrant_regret.svg', 'section': 'E5', 'xcol': 1, 'ycols': [4, 6], 'names': ['entrant regret', 'regret bound'], 'title': 'Sleeping ledger: admitted module regret vs bound', 'alt': 'Line plot of an admitted module\'s regret and its regret bound against the wealth eps it is admitted with; regret stays below the bound at every eps and both grow as eps shrinks', 'xlabel': 'entrant starting wealth eps', 'ylabel': 'regret over 300 rounds', 'logx': True, 'logy': False}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
