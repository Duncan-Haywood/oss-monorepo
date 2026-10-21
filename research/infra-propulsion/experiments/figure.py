"""Write experiments/payload.svg: payload kept against battery pack specific energy, from section F of results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(LINES, "F. ", 0, [1, 2, 3])
    write_lines(HERE, "payload.svg", "Payload kept when diesel is swapped for a battery pack",
                "Line plot: payload as a percent of the diesel payload at the same gross mass and range, against battery pack specific energy in Wh/kg, "
                "for a long-haul truck (800 km), a unit train (1,500 km) and a Panamax bulk carrier (20,000 km)",
                "pack specific energy, Wh/kg", "payload kept, % of diesel",
                [("truck", xs, ys[0]), ("unit train", xs, ys[1]), ("bulk carrier", xs, ys[2])])


if __name__ == "__main__":
    main()
