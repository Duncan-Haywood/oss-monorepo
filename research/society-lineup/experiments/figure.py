"""Write experiments/critical_by_objection.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== A.", 0, [1, 2, 3])
    write_lines(HERE, "critical_by_objection.svg", "Line-cutting robot share that breaks a queue norm, by objection strength",
                "Line plot of the mean-field critical share of line-cutting robots against the chance p0 that a lone cut is objected to, for memories of 5, 9 and 17 observed cuts",
                "chance p0 that a lone cut is objected to", "critical robot share",
                [(f"memory {m}", xs, y) for m, y in zip((5, 9, 17), ys)])


if __name__ == "__main__":
    main()
