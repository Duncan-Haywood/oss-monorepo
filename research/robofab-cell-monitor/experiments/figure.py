"""Write experiments/gain_vs_printers.svg from results.txt (section 1). Re-run run.py first if the experiment changes."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().replace("=", " ").splitlines()


def main():
    xs, ys = table(TEXT, "1. Printer count", 0, [4, 8])
    write_lines(HERE, "gain_vs_printers.svg", "Cell throughput with and without a failure-aborting camera",
                "Line plot of simulated good parts per hour against printer count, blind printing and a camera that aborts failed prints after 10 minutes; the two lines merge once the arm limits the cell",
                "printers", "good parts per hour", [("blind", xs, ys[0]), ("camera, 10 min delay", xs, ys[1])])


if __name__ == "__main__":
    main()
