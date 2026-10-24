"""Write experiments/winter_condensation.svg from results.txt: winter condensation vs exterior foam thickness.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
PICK = [("Chicago (5A)", "paint"), ("Chicago (5A)", "kraft"), ("Duluth (7A)", "paint"), ("Duluth (7A)", "kraft")]


def main():
    i = TEXT.index("== winter month")
    series = []
    for city, ret in PICK:
        ys = []
        for l in TEXT[i + 1:i + 13]:
            if l.strip().startswith(city):
                ys.append(float(re.search(ret + r":\s*([\d.]+)@", l).group(1)))
        series.append((f"{city.split()[0]}, {ret}", [0.0, 1.0, 2.0], ys))
    if any(len(s[2]) != 3 for s in series):
        raise SystemExit("no rows parsed")
    write_lines(HERE, "winter_condensation.svg", "Winter condensation at the sheathing vs exterior XPS (g/m2/day)",
                "Line plot of steady-state winter condensation against exterior foam thickness: falls with foam, "
                "far lower with a kraft retarder than painted drywall, highest in Duluth",
                "exterior XPS thickness (in)", "condensation (g/m2/day)", series)


if __name__ == "__main__":
    main()
