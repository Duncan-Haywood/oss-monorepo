"""Write experiments/rate_vs_threshold.svg from results.txt (section 1). Re-run run.py first if the experiment changes."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINES = (HERE / "results.txt").read_text().splitlines()


def main():
    blind = float(next(l for l in LINES if l.startswith("Blind printing")).split("sim")[1].split()[0])
    on, series = False, {}
    for l in LINES:
        if l.startswith("1. "):
            on = True
        elif l.startswith("2. "):
            break
        elif on:
            p = l.split()
            if len(p) == 8 and p[0].replace(".", "").isdigit() and float(p[1]) >= 1.5:
                series.setdefault(p[0], ([], []))
                series[p[0]][0].append(float(p[1])); series[p[0]][1].append(float(p[5]))
    write_lines(HERE, "rate_vs_threshold.svg", "Cell throughput against the detector's alarm threshold",
                "Line plot of simulated good parts per hour against the alarm threshold z for detectors of d' 1, 2, 3 and 4 with a look every 2 minutes; every curve collapses below blind printing when z is below about 2.5 and peaks at z of 3 to 3.5",
                "alarm threshold z (score units)", "good parts per hour",
                [(f"d' = {k}", xs, ys) for k, (xs, ys) in series.items()], hline=blind)


if __name__ == "__main__":
    main()
