"""Figure for milestone 6d: change in people's lane order caused by robots in the social-force crowd,
against the human side-bias multiplier (fitted beta 0.1), at 20% and 30% robots, split into the seed effect
(crowd-side robots minus a density-matched control with no robots) and its two parts: side (crowd-side
robots minus lateral-goal robots, the same bodies) and body (lateral-goal robots minus the control).
Pooled over the two HERMES runs.

Reads experiments/m6d_lane_test_results.txt. Stdlib only. Run: python3 experiments/m6d_figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINE = re.compile(r"^\s+(\w+)\s+x([\d.]+)\s+share ([\d.]+) (\w+)\s+(.*)$")
EFF = re.compile(r"(\w+) ([-+][\d.]+) \[")


def read():
    d = {}
    for line in (HERE / "m6d_lane_test_results.txt").read_text().splitlines():
        m = LINE.match(line)
        if not m:
            continue
        for kind, v in EFF.findall(m.group(5)):
            d[(m.group(1), float(m.group(2)), m.group(3), m.group(4), kind)] = float(v)
    return d


def main():
    d = read()
    xs = sorted({k[1] for k in d if k[0] == "sf"})
    series = [(f"{kind}, {pct}% robots", xs, [d[("sf", x, sh, "lane", kind)] for x in xs])
              for kind in ("seed", "side", "body") for pct, sh in (("20", "0.20"), ("30", "0.30"))]
    write_lines(HERE, "m6d_lane_test.svg",
                "Robots in a social-force crowd: people's lane-order change by cause",
                "Change in people's lane order against the human side-bias multiplier: seed effect of "
                "crowd-side robots against a density-matched control, split into side-holding and extra bodies",
                "human side-bias multiplier (x fitted beta 0.1)", "change in people's lane order", series)


if __name__ == "__main__":
    main()
