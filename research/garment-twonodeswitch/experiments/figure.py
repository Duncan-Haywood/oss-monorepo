"""Write experiments/evap_by_state.svg: evaporative loss at 180 min by ambient temperature, closed vs open vent, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (section A), never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def section_a():
    """{(model, state): ([ambient C], [evap W/m2])} from the 'A. Fixed states' block."""
    out, on = {}, False
    for l in TEXT:
        if l.startswith("== A."):
            on = True
            continue
        if on and l.startswith("=="):
            break
        p = l.split()
        if on and len(p) >= 13 and p[5] == "tsk":
            xs, ys = out.setdefault((p[3], p[4]), ([], []))
            xs.append(float(p[1]))
            ys.append(float(p[12]))
    if not out:
        raise SystemExit("no rows parsed for section A")
    return out


def main():
    a = section_a()
    series = [(f"{m} {s}", *a[(m, s)]) for m in ("ours", "ref") for s in ("closed", "open")]
    write_lines(HERE, "evap_by_state.svg", "Two-node garment switch: evaporative loss at 180 min",
                "Line plot of evaporative heat loss against ambient temperature for closed and open vent states in two models; opening the vent lowers evaporative loss at 31 C and changes little at 24 C and 16 C",
                "ambient temperature (C)", "evaporative loss (W/m2)", series)


if __name__ == "__main__":
    main()
