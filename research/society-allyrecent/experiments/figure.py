"""Write experiments/tipped_by_robot_share.svg from results.txt.   python3 experiments/figure.py"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    series = []
    c = "0.03"
    i = next(k for k, l in enumerate(TEXT) if l.strip() == f"== c={c}")
    rhos = [float(x) for x in re.findall(r"rho=([\d.]+)", TEXT[i + 1])]
    for l in TEXT[i + 2:i + 7]:
        name = " ".join(l.split()[:2]) if "watch" in l else "constant"
        series.append((f"{name}, c = {c}", rhos, [int(x.split("/")[0]) / 12 for x in re.findall(r"\d+/12", l)]))
    write_lines(HERE, "tipped_by_robot_share.svg",
                "Share of crowds tipped with 20% fading allies, by how far back allies look",
                "Line plot of the fraction of 12 seeded crowds that end with most people on the robots' side against the committed robot share, for a constant fade rate and for fading driven by the last 1, 3, 5 or 9 partners",
                "committed robot share", "fraction of crowds tipped", series)


if __name__ == "__main__":
    main()
