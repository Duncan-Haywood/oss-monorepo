"""Write experiments/fano_vs_window.svg: Fano factor against window length for four drift correlation times, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'fano_vs_window.svg', 'section': '   D. Fano factor', 'xcol': 0, 'ycols': [1, 2, 3, 4],
       'names': ['i.i.d. drift', 'tau = 10 blocks', 'tau = 100 blocks', 'tau = 1000 blocks'],
       'title': 'Fano factor of false-wake counts against window length (5% noise-scale drift)',
       'alt': 'Log-log line plot of the Fano factor of false-wake counts against window length in 100-second blocks: flat near 1.9 for independent drift, and rising to 17, 150 and 620 for drift with correlation times of 10, 100 and 1000 blocks',
       'xlabel': 'window length (blocks of 100 s)', 'ylabel': 'Fano factor (log)', 'logx': True, 'logy': True, 'hline': 1.0}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
