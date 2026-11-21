"""Write width_curves_t2_t3.svg: shape error against arm-width offset, relative to each tier's own
+1 cm score, for the spring sheet (T2) and the triangle tier (T3), calibrated bending (c = 0.485).

    python3 experiments/m4e_hanger_tier/figure.py

Parsed from the committed results.txt (section 1), never retyped. Three of the nine fabrics are
drawn so the lines stay legible; all nine are in results.txt.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SHOW = ("F2", "F5", "F9")   # all 15 of their calibrated T3 solves converged; F2 is the one split decision


def rows():
    lines = (HERE / "results.txt").read_text().splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("1. per case"))
    for ln in lines[start + 2:]:
        if not ln.strip():
            break
        yield ln.split()


def main():
    d = {}
    for t in rows():
        if t[1] == "c" and t[0] in SHOW:
            d.setdefault(t[0], []).append((float(t[2]), float(t[4]), float(t[5])))
    series = []
    for c in SHOW:
        p = sorted(d[c])
        ref = {k: v for k, v in zip(("t2", "t3"), next((r[1], r[2]) for r in p if r[0] == 1.0))}
        series.append((f"{c} spring sheet", [r[0] for r in p], [r[1] - ref["t2"] for r in p]))
        series.append((f"{c} triangle tier", [r[0] for r in p], [r[2] - ref["t3"] for r in p]))
    write_lines(HERE, "width_curves_t2_t3.svg",
                "Hanger arm width: shape error relative to the +1 cm arm, two 3D tiers",
                "Line plot of each tier's shape error minus its own error at the +1 cm width offset, against the "
                "arm-width offset from -1 to +3 cm, for three woven fabrics on a 3 cm half-depth wood-shaped arm, "
                "comparing the 3D spring sheet with the triangle finite-element tier, both with calibrated bending",
                "arm half-width offset from the half shoulder (cm)", "shape error minus error at +1 cm (cm RMS)",
                series, hline=0.0)


if __name__ == "__main__":
    main()
