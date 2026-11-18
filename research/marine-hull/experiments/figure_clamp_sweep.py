"""Write experiments/clamp_sweep.svg: five-lag mean dominance count against the clamp half-width (milestone 6zzx).

    python experiments/figure_clamp_sweep.py

Numbers are parsed from the committed results_clamp_sweep.txt ("Five-lag mean" block), never retyped.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

COLS = ["nasa all168", "nasa pp240", "nasa hi168", "era5 hi168", "cross hi168", "reverse hi168"]
SHOW = {"nasa all168": "all 30 points (NASA)", "nasa hi168": "nine high-latitude points (NASA)",
        "cross hi168": "nine points, plan NASA / sail ERA5", "reverse hi168": "nine points, plan ERA5 / sail NASA"}


def parse(text):
    lines = text.splitlines()
    i = next(k for k, s in enumerate(lines) if s.startswith("Five-lag mean"))
    xs, ys, at = [], {c: [] for c in COLS}, {}
    for s in lines[i + 2:]:
        if not s.strip():
            break
        cells = [c.strip() for c in s.split("|")]
        if cells[0] == "AT90":
            at = dict(zip(COLS, (float(c) for c in cells[1:])))
            continue
        xs.append(float(cells[0]))
        for c, cell in zip(COLS, cells[1:]):
            ys[c].append(float(re.match(r"[-\d.]+", cell).group()))
    return xs, ys, at


def main():
    xs, ys, at = parse((HERE / "results_clamp_sweep.txt").read_text())
    series = [(SHOW[c], xs, ys[c]) for c in SHOW]
    write_lines(HERE, "clamp_sweep.svg", "Solar boat: one-season sun correction vs clamp width",
                "Line plot of the mean number of 168 cases where the corrected boat dominates the 7-day baseline, "
                "against the half-width of the clamp on the learned month ratios: on all 30 points the count falls "
                f"from {ys['nasa all168'][0]:.0f} at 0.05 to {ys['nasa all168'][-1]:.0f} above 0.20 (no correction "
                f"{at['nasa all168']:.0f}); in the plan-NASA, sail-ERA5 case it rises from {ys['cross hi168'][0]:.0f} "
                f"to {ys['cross hi168'][-1]:.0f}",
                "clamp half-width h (ratios held to 1 - h ... 1 + h)", "mean winning cases of 168", series,
                hline=at["nasa all168"])


if __name__ == "__main__":
    main()
