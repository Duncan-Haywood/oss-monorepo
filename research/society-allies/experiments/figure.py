"""Write experiments/block_size.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    rows, on = [], False
    for l in TEXT:
        if l.startswith("== B."):
            on = True
            continue
        if on and l.startswith("=="):
            break
        p = l.split()
        if on and len(p) == 5 and p[0].isdigit():
            rows.append((float(p[0]), [float(c.split("/")[0]) for c in p[1:]]))
    series = [(f"robot share {r}", [b for b, _ in rows], [v[i] for _, v in rows])
              for i, r in enumerate((0.08, 0.12, 0.20, 0.30))]
    write_lines(HERE, "block_size.svg", "People on the robots' side by size of robot blocks (ring, k = 2)",
                "Line plot of the mean final share of people on the robots' side against the number of robots in each block, for four robot shares, on a ring where partners sit within 2 sites",
                "robots per block", "share of people on L", series)


if __name__ == "__main__":
    main()
