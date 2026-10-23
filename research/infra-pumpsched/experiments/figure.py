"""Write experiments/saving.svg: cost saved against the shipped window by tariff ratio, from results.txt.   python experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    block = (HERE / "results.txt").read_text().split("== D.")[1].split("== E.")[0]
    rows = [[c.strip() for c in l.split("|")] for l in block.splitlines() if l.count("|") == 6 and l[0].isalpha() and not l.startswith("tariff")]
    series = []
    for kind in ("evening", "daytime", "midday-cheap"):
        r = [x for x in rows if x[0] == kind]
        series.append((kind, [float(x[1]) for x in r], [float(x[4]) for x in r]))
    write_lines(HERE, "saving.svg", "Cost saved by the best pump-10 window vs the shipped one (Net3)",
                "Line plot: percent of daily pumping cost saved by the best feasible pump 10 window against the shipped 01:00 to 15:00 window, "
                "by peak to off-peak price ratio, for three assumed tariff shapes",
                "peak / off-peak price ratio", "cost saved, %", series, logx=True)


if __name__ == "__main__":
    main()
