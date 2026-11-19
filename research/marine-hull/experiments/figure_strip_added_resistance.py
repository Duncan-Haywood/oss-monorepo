"""Draw experiments/strip_added_resistance.svg (added resistance in regular head waves, strip theory against
ITTC STAWAVE-2, for the 4 m monohull and an in-range Wigley).

    python3 experiments/figure_strip_added_resistance.py

Reads the `curve` rows of results_strip_added_resistance.txt (milestone 7z). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_curves(text):
    """{(hull, Fr): [(lambda/L, sigma_strip, sigma_stawave)]} from the `curve` rows."""
    out = {}
    for line in text.splitlines():
        if line.startswith("curve "):
            _, hull, fr, x, s, sw = line.split()
            out.setdefault((hull, float(fr)), []).append((float(x), float(s), float(sw)))
    return out


if __name__ == "__main__":
    c = parse_curves((HERE / "results_strip_added_resistance.txt").read_text())
    m, r = c[("monohull", 0.16)], c[("in-range", 0.20)]
    series = [
        ("4 m monohull (L/B 10, B/T 1.46), Fr 0.16: strip theory", [p[0] for p in m], [p[1] for p in m]),
        ("4 m monohull, Fr 0.16: STAWAVE-2 (extrapolated)", [p[0] for p in m], [p[2] for p in m]),
        ("in-range Wigley (L/B 7, B/T 2.5), Fr 0.20: strip theory", [p[0] for p in r], [p[1] for p in r]),
        ("in-range Wigley, Fr 0.20: STAWAVE-2", [p[0] for p in r], [p[2] for p in r]),
    ]
    write_lines(HERE, "strip_added_resistance.svg",
                "Does the ship-scale wave-resistance formula hold for a 4 m survey hull?",
                "Added resistance in regular head waves, Gerritsma-Beukelman strip theory (Frank close-fit sections) "
                "against ITTC STAWAVE-2. Strip/STAWAVE peak ratio: 2.6 in range, 5.7 for the 4 m monohull",
                "wavelength / hull length", "sigma = R_aw / (rho g zeta^2 B^2 / L)", series)
