"""Write experiments/cost_closure.svg: cost closure against vitamin-substitution budget, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").replace("%", " ").splitlines()
CFG = {'fname': 'cost_closure.svg', 'section': '   objective: cost closure', 'maxrows': 7, 'xcol': 0, 'ycols': [1, 2, 3], 'names': ['exhaustive', 'greedy', 'random (8 evals)'], 'title': 'Selfrep redesign: cost closure vs substitution budget', 'alt': 'Line plot of cost closure of the printer, CNC and laser shop against the substitution penalty budget for exhaustive search, a greedy rule and random search at 8 evaluations; greedy tracks exhaustive and random trails', 'xlabel': 'substitution penalty budget', 'ylabel': 'cost closure (%)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
