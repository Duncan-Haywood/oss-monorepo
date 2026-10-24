"""Write experiments/tipped_by_handover.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("== initial robot share rho0=0.1"))
    hs = [float(x.split("=")[1]) for x in TEXT[i + 1].split()[1:]]
    series = []
    for l in TEXT[i + 2:i + 6]:
        c, *rest = l.split()
        k = [int(rest[2 * j].split("/")[0]) / 12 for j in range(len(hs))]
        series.append((f"fade rate c = {c}", hs, k))
    write_lines(HERE, "tipped_by_handover.svg",
                "Share of crowds on the robots' side by hand-over probability (10% robots at the start)",
                "Line plot of the fraction of 12 seeded crowds that end with most people on the robots' side against the chance that a fading ally is replaced by a robot, one line per ally fade rate",
                "hand-over probability h", "fraction of crowds tipped", series)


if __name__ == "__main__":
    main()
