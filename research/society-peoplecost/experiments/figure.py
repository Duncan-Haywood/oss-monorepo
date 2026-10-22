"""Write experiments/gain_vs_rho.svg: people-only planner gain against rho for several urgent weights, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'gain_vs_rho.svg', 'section': '== B. planner', 'xcol': 0, 'ycols': [1, 2, 3, 4], 'names': ['weight 1', 'weight 2', 'weight 3', 'weight 5'], 'title': 'Signal-reading robots: gain to people over yield-all, by how much a planner weights urgent people', 'alt': 'Line plot of the gain to people (robots excluded) of a signal-reading door fleet over yield-all against rho, the urgent cue cost relative to normal people, for planner weights 1, 2, 3 and 5 on urgent people; with weight 1 the gain turns positive only below rho about 0.35, with weight 5 below about 0.7', 'xlabel': 'rho = urgent cue cost / normal cue cost', 'ylabel': 'gain over yield-all (people only)', 'logx': False, 'logy': False, 'hline': 0.0, 'maxrows': 8}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
