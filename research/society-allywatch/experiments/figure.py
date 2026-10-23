"""Write experiments/tipped_by_robot_share.svg from results.txt.   python3 experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def block(mode):
    i = next(k for k, l in enumerate(TEXT) if l.strip() == f"== fade={mode}")
    rhos = [float(x) for x in re.findall(r"rho=([\d.]+)", TEXT[i + 1])]
    rows = {}
    for l in TEXT[i + 2:i + 6]:
        c, *cells = l.split()
        rows[c] = [int(x.split("/")[0]) / 12 for x in re.findall(r"\d+/12", l)]
    return rhos, rows


def main():
    series = []
    for c in ("0.01", "0.03"):
        for mode, name in (("const", "constant fade"), ("watch", "fade when the crowd walks away")):
            rhos, rows = block(mode)
            series.append((f"{name}, c = {c}", rhos, rows[c]))
    write_lines(HERE, "tipped_by_robot_share.svg",
                "Share of crowds tipped with 20% fading allies, by robot share",
                "Line plot of the fraction of 12 seeded crowds that end with most people on the robots' side against the committed robot share, for a constant fade rate and for fading that depends on what the ally has watched",
                "committed robot share", "fraction of crowds tipped", series)


if __name__ == "__main__":
    main()
