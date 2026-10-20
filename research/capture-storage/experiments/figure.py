"""Write experiments/offload_vs_cards.svg: grams of storage by rig size, parsed from results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B. rig size", 0, [3, 4])
    write_lines(HERE, "offload_vs_cards.svg", "Storage weight by rig size: cards only vs nightly offload to two SSDs",
                "Line plot of grams of storage carried against number of cameras, for cards only (one copy) and for nightly offload to two SSD copies within one evening hour; the offload plan is heavier and stops being feasible beyond six cameras",
                "cameras in the rig (4 h/day, 7 days)", "grams of storage (log scale)",
                [("cards only", xs, ys[0]), ("offload x2, 1 h/night", xs, ys[1])], logy=True)


if __name__ == "__main__":
    main()
