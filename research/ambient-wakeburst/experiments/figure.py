"""Write experiments/fano_vs_drift.svg: Fano factor of wake counts against noise-scale drift, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'fano_vs_drift.svg', 'section': '   E. Fano factor', 'xcol': 0, 'ycols': [1, 2, 3], 'names': ['m = 1', 'm = 3', 'm = 5'], 'title': 'Fano factor of wake counts per 1,000 s window', 'alt': 'Line plot on a log axis of the Fano factor of false-wake counts against the window-to-window noise-scale drift: about 1 with no drift, rising to 30 to 60 at 10 percent drift', 'xlabel': 'drift sigma (log-scale sd of noise level)', 'ylabel': 'Fano factor (log)', 'logx': False, 'logy': True, 'hline': 1.0}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
