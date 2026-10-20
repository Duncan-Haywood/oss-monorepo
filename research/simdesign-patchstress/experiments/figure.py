"""Write experiments/stress_vs_mesh.svg: peak and patch-averaged stress against mesh size at w12 r2, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CFG = {'fname': 'stress_vs_mesh.svg', 'section': 'w12 r2', 'xcol': 0, 'ycols': [2, 3, 4, 5], 'names': ['peak', 'patch 1', 'patch 2', 'patch 3'], 'title': 'Bracket stress against mesh size (w=12, r=2 mm)', 'alt': 'Line plot of peak and patch-averaged bracket stress in MPa against element size on a log axis; peak stress keeps rising as the mesh refines while the patch 2 and 3 averages change far less', 'xlabel': 'element size h (mm)', 'ylabel': 'stress (MPa)', 'logx': True, 'logy': False, 'maxrows': 5}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c["logx"], logy=c["logy"])


if __name__ == "__main__":
    main()
