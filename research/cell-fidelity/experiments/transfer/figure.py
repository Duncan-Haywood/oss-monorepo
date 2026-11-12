"""Write experiments/transfer/transfer.svg: how well SPMe@n ranks designs against 100-cycle DFN, per parameter set.

    python experiments/transfer/figure.py

Numbers are parsed from the committed results.txt (section F), never retyped: re-run run.py report first if it changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = ["OKane2022 (128 fresh designs)", "Ecker2015 (64 designs)", "Ai2020 (64 designs)"]


def main():
    xs, ys = table(TEXT, "F. Spearman", 0, [1, 2, 3])
    write_lines(HERE, "transfer.svg", "SPMe run for n cycles as a ranker of 100-cycle DFN, three parameter sets",
                "Line plot of the Spearman correlation between SPMe's n-cycle design score and DFN's 100-cycle score "
                "against n (2 to 100 cycles), one line per PyBaMM parameter set",
                "SPMe cycles n", "Spearman with DFN@100", list(zip(NAMES, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
