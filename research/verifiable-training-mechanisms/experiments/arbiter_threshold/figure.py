"""Write arbiter_threshold.svg: on the fresh holdout seeds, the conviction rate of one forged float16 step in each
cell's least-convicted zone (the zone a forger who knows the thresholds would cheat in), for milestone 90's rule
(10x the zone's honest calibration maximum) and the rule selected in milestone 91 (10x the zone's 0.95 quantile,
80 calibration seeds).

    python3 figure.py

Numbers are parsed from the committed results.txt (analyze.py), never retyped."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import table, write_bars  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
NAMES = {"sgd": "SGD", "momentum": "momentum", "adam15": "Adam 1e-3", "adam60": "Adam 4e-3"}


def main():
    cats, ys = table(TEXT, "== Figure table", 0, [1, 2], xtext=True)
    labels = [f"{NAMES[c.split('/')[0]]} {c.split('/')[1]}" for c in cats]
    write_bars(HERE, "arbiter_threshold.svg",
               "Worst-zone conviction of one forged float16 step, fresh holdout seeds (200 segments per zone)",
               "Horizontal bar chart, one row per optimiser and schedule: share of segments convicted in the"
               " least-convicted zone, for the maximum-based threshold of milestone 90 and the quantile-based threshold"
               " selected in milestone 91; values are in results.txt",
               "share convicted in the worst zone", labels,
               [("10x zone max, 40 calibration seeds (milestone 90)", ys[0]),
                ("10x zone 0.95 quantile, 80 seeds (selected)", ys[1])], fmt="{:.2f}")


if __name__ == "__main__":
    main()
