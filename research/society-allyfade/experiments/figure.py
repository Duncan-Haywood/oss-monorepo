"""Write experiments/tipped_by_robot_share.svg from results.txt.   python3 experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("== sl=0.2 allies fade") and "sr=0.0" in l)
    rhos = [float(x) for x in re.findall(r"rho=([\d.]+)", TEXT[i + 2].split("stubborn")[0])]
    series = []
    for l in TEXT[i + 3:i + 9]:
        c, *cells = l.split()
        k = [int(x.split("/")[0]) / int(x.split("/")[1]) for x in cells[:len(rhos)]]
        series.append((f"fade rate c = {c}", rhos, k))
    write_lines(HERE, "tipped_by_robot_share.svg",
                "Share of crowds on the robots' side after 20% allies have faded, by robot share",
                "Line plot of the fraction of 12 seeded crowds that end with most people on the robots' side against the committed robot share, one line per ally fade rate",
                "committed robot share", "fraction of crowds tipped", series)


if __name__ == "__main__":
    main()
