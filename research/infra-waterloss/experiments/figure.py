"""Write experiments/detection.svg: detection rate of covered leaks against leak size, from results.txt.   python experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

SIZES = [0.25, 0.5, 1, 2, 4]


def covered_rates(text, section, row):
    """Covered-leak detection rates of the results.txt row starting `row` in the block `== <section>.`"""
    block = text.split(f"== {section}.")[1].split("== ")[0]
    line = next(l for l in block.splitlines() if l.startswith(row))
    return [float(v) for v in line.split("|")[2].split()]


def main():
    text = (HERE / "results.txt").read_text()
    row = "flow-adjusted CUSUM"
    series = [(f"{lab} demand error", SIZES, covered_rates(text, sec, row)) for lab, sec in (("low", "C4"), ("base", "C2"), ("high", "C5"))]
    write_lines(HERE, "detection.svg", "Detection of leaks that the sensors can see, by leak size (Net3)",
                "Line plot: share of leaks within reach of the five pressure sensors that a CUSUM detector finds within three days, at a 5 percent false alarm budget, "
                "against leak flow as a percent of total demand, for low, base and high demand uncertainty",
                "leak flow, % of total demand", "share detected", series)


if __name__ == "__main__":
    main()
