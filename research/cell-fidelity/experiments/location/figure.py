"""Figure for milestone 3 part 2b: median time to a design within 1% of the DFN-best, against pool size.

    python experiments/location/figure.py    # summary.json -> location.svg (stdlib only)

The plain 10-cycle SPMe screen (section E of results.txt, post hoc) against milestone 4's GP-EI and its two best
whole-pool screens. Numbers are read from summary.json, never retyped.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    S = json.loads((HERE / "summary.json").read_text())
    P = [int(p) for p in S["sweep"]]
    ref = lambda m: [S["sweep"][str(p)][m] for p in P]
    series = [("SPMe@10 screen", P, [S["plain"]["SPMe@10"]["T1_median"][str(p)] for p in P]),
              ("GP-EI on DFN@100", P, ref("GP-EI DFN@100")),
              ("SPM@100 screen", P, ref("screen SPM@100")),
              ("DFN@2 screen", P, ref("screen DFN@2"))]
    write_lines(HERE, "location.svg", "A 10-cycle SPMe screen is fastest on pools of 64 and 96; a 2-cycle DFN screen edges it below",
                "Median charged seconds to a design within 1% of the pool's DFN@100 best against pool size, 30 pools each",
                "designs in the pool", "median seconds to within 1% (30 pools)", series)


if __name__ == "__main__":
    main()
