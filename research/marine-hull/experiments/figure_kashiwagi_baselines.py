"""Draw experiments/kashiwagi_baselines.svg: heave of Kashiwagi's slender Wigley at Fn 0.2, measured against our
strip theory (as is, with A35 = A53 = 0, with the measured coupling) and the paper's NSM, modified EUT and
modified NSM curves (milestone 7ze).

    python3 experiments/figure_kashiwagi_baselines.py

Reads the `hrow` lines of results_kashiwagi_baselines.txt and the measured heave points of
data/kashiwagi2022_slender_wigley_fn020.csv. Stdlib only.
"""
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_rows(text):
    return [tuple(float(v) for v in line.split()[1:8]) for line in text.splitlines() if line.startswith("hrow ")]


if __name__ == "__main__":
    rows = parse_rows((HERE / "results_kashiwagi_baselines.txt").read_text())
    x = [r[0] for r in rows]
    with open(HERE / "data" / "kashiwagi2022_slender_wigley_fn020.csv") as f:
        meas = sorted((float(r["lambda_over_L"]), float(r["value"])) for r in csv.DictReader(f)
                      if r["series"] == "heave" and 0.79 <= float(r["lambda_over_L"]) <= 2.0)
    series = [
        ("tank (Kashiwagi et al. 2000, via Kashiwagi 2022 Fig. 2)", [m[0] for m in meas], [m[1] for m in meas]),
        ("our strip theory", x, [r[1] for r in rows]),
        ("our strip, A35 = A53 = 0", x, [r[2] for r in rows]),
        ("our strip, measured coupling", x, [r[3] for r in rows]),
        ("Kashiwagi NSM (strip)", x, [r[4] for r in rows]),
        ("Kashiwagi modified EUT", x, [r[5] for r in rows]),
    ]
    write_lines(HERE, "kashiwagi_baselines.svg",
                "Heave of a slender Wigley in head waves: tank vs strip theory and the state of the art",
                "Heave amplitude over wave amplitude of a 2 m modified Wigley (L/B 6.67) at Froude number 0.2 against "
                "wavelength over length: tank points, our strip theory as is, with its speed-induced added-mass coupling "
                "removed, and with the measured coupling coefficients, and Kashiwagi's NSM and modified EUT curves",
                "wavelength / ship length", "heave / wave amplitude", series)
