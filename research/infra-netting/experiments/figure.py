"""Write experiments/delay.svg: settlement delay against liquidity with and without gridlock resolution, from sections C and D of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, dk = table(LINES, "== C.", 0, [1, 2])
    _, fi = table(LINES, "== D.", 0, [1, 2])
    write_lines(HERE, "delay.svg", "Settlement delay against liquidity, with and without gridlock resolution",
                "Line plot: value-weighted mean settlement delay as a fraction of the day against liquidity level alpha (0 = lower bound, 1 = upper bound) for simulated Danish-shaped and Finnish-shaped systems, FIFO queue and gridlock resolution",
                "liquidity level alpha (0 = lower bound, 1 = upper bound)", "mean delay, fraction of day",
                [("DK FIFO", xs, dk[0]), ("DK resolution", xs, dk[1]), ("FI FIFO", xs, fi[0]), ("FI resolution", xs, fi[1])])


if __name__ == "__main__":
    main()
