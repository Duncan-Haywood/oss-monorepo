"""Draw experiments/energy_split.svg (the energy model: Wh/km by term against speed, central 4 m monohull).

    python3 experiments/figure_energy_split.py

Reads the `split` lines of results_energy_split.txt (milestone 7zb; the paper's Fig. 1). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_split(text):
    """[(speed, friction, form, wave, hotel, total)] in Wh/km from the `split` lines."""
    return [tuple(float(v) for v in line.split()[1:7]) for line in text.splitlines() if line.startswith("split ")]


if __name__ == "__main__":
    rows = [r for r in parse_split((HERE / "results_energy_split.txt").read_text()) if r[0] <= 2.2]
    u = [r[0] for r in rows]
    series = [
        ("total", u, [r[5] for r in rows]),
        ("hotel, 30 W / speed", u, [r[4] for r in rows]),
        ("hull: friction + form + wave", u, [r[1] + r[2] + r[3] for r in rows]),
        ("of which Michell wave", u, [r[3] for r in rows]),
    ]
    write_lines(HERE, "energy_split.svg",
                "Where does a small survey boat's energy go?",
                "Electrical energy per km of the central 4 m Wigley monohull (200 kg, 10 kWh, 30 W payload) by term. "
                "The minimum of the total, 12.14 Wh/km at 1.00 m/s, is the best-range speed (823.7 km)",
                "speed (m/s)", "energy (Wh/km)", series)
