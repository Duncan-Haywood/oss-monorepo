"""Write experiments/headroom.svg: worst accumulator and bias use, as % of the tile's limit, by hidden width.

    python experiments/figure.py      (after analyze.py)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== headroom", 0, [1, 2, 3, 4], sep="|")
    names = ["layer-1 accumulator, 70 inputs", "layer-1 accumulator, 120 inputs", "layer-2 accumulator, 120 inputs", "layer-1 bias, 120 inputs"]
    write_lines(HERE, "headroom.svg", "Trained KWS models on the tile: worst use of each limit (% of limit; 100 = overflow)",
                "Line plot of the largest accumulator and bias magnitude reached by 96 trained keyword-spotting models, as a percentage of the Tiny Tapeout engine's limit, against hidden width 8 to 64; every line stays below 45 percent",
                "hidden width H", "worst use, % of limit", list(zip(names, [xs] * 4, ys)), hline=100)


if __name__ == "__main__":
    main()
