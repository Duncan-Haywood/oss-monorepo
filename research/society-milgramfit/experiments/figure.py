"""Write experiments/enforcers_by_objection.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    xs, ys = table(TEXT, "== B.", 0, [1, 2, 3, 4])
    write_lines(HERE, "enforcers_by_objection.svg", "Enforcer robots needed, by how often people stop a lone cut",
                "Line plot of the least enforcer-robot share that keeps most people queueing, against the chance that people stop a lone cut, for 0, 10, 20 and 30 percent cutter robots",
                "lone-cut stopping chance p0", "enforcer robot share needed",
                [(f"cutters {c}%", xs, y) for c, y in zip((0, 10, 20, 30), ys)])


if __name__ == "__main__":
    main()
