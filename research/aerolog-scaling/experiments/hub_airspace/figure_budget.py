"""Write band_budget.svg: median conflict weight left (F / F_1) against the usable depth H of the stack, one line
per level spacing h, from band_budget_results.txt.

    python3 figure_budget.py

Numbers are parsed from the committed results file, never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "band_budget_results.txt").read_text().splitlines()


def rows(m):
    out, on = [], False
    for ln in TEXT:
        if ln.startswith("## M = %d: medians" % m):
            on = True
            continue
        if on and ln.startswith("##"):
            break
        p = ln.split()
        if on and len(p) >= 6:
            try:
                out.append([float(x) for x in p[:6]])
            except ValueError:
                pass
    return out


def main():
    series = []
    for m in (12, 16):
        r = rows(m)
        for h, ft in ((7.62, 25), (15.24, 50), (30.48, 100)):
            sel = [x for x in r if abs(x[1] - h) < 1e-6]
            series.append(("%d ft levels, %d operators" % (ft, m), [x[0] for x in sel], [x[4] for x in sel]))
    write_lines(HERE, "band_budget.svg", "Drone altitude bands under a fixed altitude budget",
                "Line plot of the median share of conflict weight left against the usable depth of the stack in "
                "metres, one line per level spacing (25, 50 and 100 ft) for 12 and 16 operators; thinner levels "
                "and deeper stacks leave less",
                "usable depth of the stack H (m)", "conflict weight left / single band", series)


if __name__ == "__main__":
    main()
