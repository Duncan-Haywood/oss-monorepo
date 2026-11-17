"""Write critical_mass.svg: mean-field critical committed fraction vs the simulated one in
groups of 20, by memory length M, parsed from results.txt (never retyped).

    python3 experiments/convention/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, (mf, sim) = table(TEXT, "-- horizon 200 rounds", 0, [1, 3], maxrows=13)
    write_lines(HERE, "critical_mass.svg",
                "Committed minority needed to flip a convention, by memory length",
                "Line plot: the mean-field critical committed fraction rises from 0.11 at memory 3 to 0.27 at "
                "memory 15; simulated groups of 20 track it within 0.03 and sit at 0.25 for memory 11 to 15",
                "memory length M (names remembered)", "critical committed fraction",
                [("mean field", xs, mf), ("groups of 20, 200 rounds", xs, sim)], hline=0.25)


if __name__ == "__main__":
    main()
