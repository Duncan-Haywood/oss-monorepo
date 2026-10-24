"""Write experiments/patch_size.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    rows, on = [], False
    for l in TEXT:
        if l.startswith("== C.") and "rho=0.25" in l:
            on = True
            continue
        if on and l.startswith("=="):
            break
        p = l.split()
        if on and len(p) == 6 and p[0].isdigit():
            rows.append((float(p[1]), [float(c.split("/")[0]) for c in p[2:]]))
    series = [(f"k = {k}", [s for s, _ in rows], [v[i] for _, v in rows]) for i, k in enumerate((1, 2, 3, 5))]
    write_lines(HERE, "patch_size.svg", "People on the robots' side by side of the robot patch (grid, robot share 0.25)",
                "Line plot of the mean final share of people on the robots' side against the side length of each square robot patch on a 16 by 16 torus, for neighbourhood radii 1, 2, 3 and 5",
                "patch side (sites)", "share of people on L", series)


if __name__ == "__main__":
    main()
