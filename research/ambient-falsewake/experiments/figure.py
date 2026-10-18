"""Write experiments/wakes_vs_threshold.svg: exact wakes per day against the independent claim, from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()
CFG = {'fname': 'wakes_vs_threshold.svg', 'section': '   C. Wakes per day', 'xcol': 0, 'ycols': [1, 2], 'names': ['exact (AR(1), phi 0.9)', 'independent-frames claim'], 'title': 'False wakes per day, 3 consecutive frames', 'alt': 'Line plot on a log axis of false wakes per day against threshold for a three-frame trigger: the exact rate on correlated scores is thousands to billions of times the independent-frames claim', 'xlabel': 'threshold (score sd)', 'ylabel': 'wakes per day (log)', 'logx': False, 'logy': True}


def main():
    c = CFG
    xs, ys = table(TEXT, c["section"], c["xcol"], c["ycols"], c.get("maxrows"))
    series = list(zip(c["names"], [xs] * len(ys), ys))
    write_lines(HERE, c["fname"], c["title"], c["alt"], c["xlabel"], c["ylabel"], series,
                logx=c.get("logx", False), logy=c.get("logy", False), hline=c.get("hline"))


if __name__ == "__main__":
    main()
