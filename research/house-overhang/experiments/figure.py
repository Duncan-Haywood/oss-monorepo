"""Write experiments/overhang_value.svg: gross energy value of a south overhang, parsed from results.txt.

    python experiments/figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
CITIES = ("Miami (1A)", "Houston (2A)", "Chicago (5A)", "Albuquerque (4B)")


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("B. "))
    series = []
    for l in TEXT[i + 1:i + 9]:
        city = l.strip().split("  ")[0]
        if city in CITIES:
            gas = l.split("|")[0].split(":", 1)[1]
            ys = [0.0] + [float(v.replace(",", "")) for v in re.findall(r"P\d\s+([+-][\d,]+)", gas)]
            series.append((city, [0.0, 1.0, 2.0, 3.0, 4.0], ys))
    if len(series) != len(CITIES):
        raise SystemExit("no rows parsed")
    write_lines(HERE, "overhang_value.svg", "Gross energy value of a south overhang (30-year NPC, gas + AC)",
                "Line plot of the energy saved over 30 years by a south-window overhang against its projection: "
                "positive and rising in Miami, small and then negative in Chicago and Albuquerque",
                "overhang projection (ft)", "NPC of energy saved ($)", series, hline=0.0)


if __name__ == "__main__":
    main()
