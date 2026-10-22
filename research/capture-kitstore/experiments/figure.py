"""Write experiments/kit_vs_joint.svg: shot variety against carried weight, kit-only vs kit plus storage. Parses results.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "A. ", 0, [1, 6])
    series = [("kit only (storage ignored)", xs, ys[0]), ("kit + storage counted", xs, ys[1])]
    write_lines(HERE, "kit_vs_joint.svg", "Shot variety by total carried weight",
                "Line plot of the number of distinct band-by-viewpoint shots a travel kit reaches against weight budget, "
                "choosing the kit alone and choosing it together with offload storage; storage costs three shots at 4 kg",
                "weight budget (g)", "distinct shots (max 18)", series)


if __name__ == "__main__":
    main()
