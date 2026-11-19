"""Draw experiments/wigley_seakeeping_tank.svg (measured added resistance of Kashiwagi's slender Wigley vs strip theory and STAWAVE-2).

    python3 experiments/figure_wigley_seakeeping_tank.py

Reads the `row` lines of section B of results_wigley_seakeeping_tank.txt (milestone 7zd). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_rows(text):
    """[(lambda/L, measured mean, n, strip, strip+refl, STAWAVE-2, STAWAVE-2 motion)] from section B's `row` lines."""
    out = []
    for line in text.split("## B.")[1].split("## C.")[0].splitlines():
        if line.startswith("row "):
            out.append(tuple(float(v) for v in line.split()[1:8]))
    return out


if __name__ == "__main__":
    rows = parse_rows((HERE / "results_wigley_seakeeping_tank.txt").read_text())
    x = [r[0] for r in rows]
    series = [
        ("tank, mean of 4 measurement series (Kashiwagi 2022, Fig. 3)", x, [r[1] for r in rows]),
        ("strip theory (Gerritsma-Beukelman), no viscous damping", x, [r[3] for r in rows]),
        ("strip theory + STAWAVE-2 reflection term", x, [r[4] for r in rows]),
        ("ITTC STAWAVE-2 (motion + reflection)", x, [r[5] for r in rows]),
    ]
    write_lines(HERE, "wigley_seakeeping_tank.svg",
                "Added resistance of a slender Wigley in head waves: tank vs methods",
                "Mean added resistance R_aw/(rho g zeta^2 B^2/L) of a 2 m modified Wigley (L/B 6.67, B/T 2.4) at "
                "Froude number 0.2 against wavelength over length: tank points averaged per wavelength, strip theory, "
                "strip theory plus STAWAVE-2's reflection term, and STAWAVE-2",
                "wavelength / ship length", "R_aw / (rho g zeta^2 B^2 / L)", series)
