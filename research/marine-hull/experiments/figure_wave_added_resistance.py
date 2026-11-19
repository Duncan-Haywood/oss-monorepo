"""Draw experiments/wave_added_resistance.svg (the 4 m monohull's peak range in measured waves over its
calm-water range, against hotel load).

    python3 experiments/figure_wave_added_resistance.py

Reads the `curve` rows of results_wave_added_resistance.txt (milestone 7y). Stdlib only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def parse_curves(text):
    """{share: [(hotel, calm_km, waves_km)]} from the `curve` rows."""
    out = {}
    for line in text.splitlines():
        if line.startswith("curve "):
            _, share, h, calm, wave = line.split()
            out.setdefault(float(share), []).append((float(h), float(calm), float(wave)))
    return out


if __name__ == "__main__":
    curves = parse_curves((HERE / "results_wave_added_resistance.txt").read_text())
    labels = {0.25: "waves within 45 deg of the bow (ITTC convention)", 1.0: "every wave met head-on (bound)"}
    series = [(labels[s], [r[0] for r in rows], [r[2] / r[1] for r in rows]) for s, rows in sorted(curves.items())]
    write_lines(HERE, "wave_added_resistance.svg",
                "How much range does a small survey monohull lose to real ocean waves?",
                "4 m, 200 kg monohull, 10 kWh; ITTC STAWAVE-2 added resistance over 14,758 hourly NDBC sea states "
                "(2024). At 30 W: -2.5% (bow sector), -9.4% (all head seas)",
                "hotel load, W (log)", "range in waves / calm-water range", series,
                logx=True, hline=1.0, vline=[200.0], xticks=[1, 10, 100, 1000, 10000])
