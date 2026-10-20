"""Write experiments/time_to_extinction.svg: exact-chain and simulated mean time to extinction, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'time_to_extinction.svg', 'section': '   C. mean time', 'xcol': 1, 'ycols': [6, 7], 'names': ['exact chain', 'simulation'], 'title': 'Replicating shop: mean time to extinction (B=4 kits)', 'alt': 'Line plot on a log axis of the mean time in hours until a small replicating fleet dies out against mean machine life L; the exact Markov chain and the simulation agree and the time grows roughly a hundredfold from L=75 h to L=300 h', 'xlabel': 'mean machine life L (h)', 'ylabel': 'mean time to extinction (h)', 'logx': False, 'logy': True, 'maxrows': 4}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
