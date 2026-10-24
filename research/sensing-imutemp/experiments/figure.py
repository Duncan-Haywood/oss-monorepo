"""Write experiments/floor.svg: angle RMS of one cheap gyro and the infinite-array floor vs ramp rate, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'floor.svg', 'section': 'r_degC_per_min', 'xcol': 0, 'ycols': [2, 5],
       'names': ['array floor (any n)', 'one cheap unit'],
       'title': 'Shared tempco: error floor an infinite gyro array keeps (T = 100 s)',
       'alt': 'Line plot of the angle RMS error floor of an infinitely large gyro array and of a single cheap gyro against temperature ramp rate; the floor grows linearly with the ramp',
       'xlabel': 'temperature ramp (degC/min)', 'ylabel': 'angle RMS error (deg)'}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series)


if __name__ == "__main__":
    main()
