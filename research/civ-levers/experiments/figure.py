"""Write experiments/bridging_backfire.svg: share of people pushed to the extremes against the
rejection threshold tau, for each bridging dose (eps = 0.3), parsed from results.txt.

    python3 experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3, 4])
    names = ["no bridging", "10% of ties rewired", "25% rewired", "50% rewired"]
    write_lines(HERE, "bridging_backfire.svg", "Bridging two camps: harmless without backfire, polarizing with it",
                "Line plot of the share of people driven to the opinion extremes against the rejection threshold tau "
                "at tolerance 0.3: with tau 0.9 no bridging dose moves anyone; at tau 0.8 rewiring half the ties sends "
                "almost everyone to the extremes, and at tau 0.7 rewiring 10% does",
                "rejection threshold tau (lower = people reject more distant views)", "share of people at the extremes",
                list(zip(names, [xs] * len(ys), ys)))


if __name__ == "__main__":
    main()
