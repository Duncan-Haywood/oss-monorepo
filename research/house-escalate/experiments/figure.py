"""Write experiments/premium_by_growth.svg: break-even heat-pump premium against real gas price growth, from results.txt part A.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("A."))
    xs = [float(g) for g in re.findall(r"g=(\d+)%", TEXT[i + 1])]
    series = []
    for l in TEXT[i + 2:i + 8]:
        m = re.match(r"\s+(\w+) \(", l)
        series.append((m.group(1), xs, [float(v.replace(",", "")) for v in re.findall(r"-?[\d,]+", l.split(")", 1)[1])]))
    if len(series) != 6:
        raise SystemExit("no rows parsed")
    write_lines(HERE, "premium_by_growth.svg", "Break-even heat-pump premium against real gas price growth",
                "Line plot of the break-even heat pump premium in USD for six climates against the real yearly growth of the gas price, 0 to 3 percent; "
                "Miami, Houston and Atlanta rise from 84, 132 and 735 to 230, 1,650 and 3,649 dollars; Chicago, Minneapolis and Duluth rise from minus 6,206, minus 5,399 and minus 6,698 to minus 2,784, minus 1,345 and minus 1,681.",
                "real gas price growth (% a year)", "break-even premium (USD)", series)


if __name__ == "__main__":
    main()
