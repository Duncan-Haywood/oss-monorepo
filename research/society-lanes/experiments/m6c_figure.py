"""Figure for milestone 6c: change in people's transit time of the 8 m section caused by robots, against
the human side-bias multiplier (social force, fitted beta 0.1), split into the seeding effect (crowd-side
robots minus a density-matched control with the same people and no robots), the opposite-side contrast
and the density effect (control minus the full crowd). Pooled over the two HERMES runs.

Reads experiments/m6c_lane_seeds_results.txt. Stdlib only. Run: python3 experiments/m6c_figure.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

LINE = re.compile(r"^\s+x([\d.]+)\s+share ([\d.]+)\s+(.*)$")
EFF = re.compile(r"(\w+)-(\w+) ([-+][\d.]+) \[")


def read():
    d = {}
    for line in (HERE / "m6c_lane_seeds_results.txt").read_text().splitlines():
        m = LINE.match(line)
        if not m:
            continue
        for kind, q, v in EFF.findall(m.group(3)):
            d[(float(m.group(1)), m.group(2), kind, q)] = float(v)
    return d


def main():
    d = read()
    xs = sorted({k[0] for k in d})
    series = [(name, xs, [d[(x, sh, kind, "transit")] for x in xs]) for name, sh, kind in [
        ("seed, 20% robots", "0.20", "seed"), ("seed, 10% robots", "0.10", "seed"),
        ("opposite, 20%", "0.20", "opp"), ("density, 20%", "0.20", "density")]]
    write_lines(HERE, "m6c_lane_seeds.svg",
                "Robots in a social-force crowd: people's transit change by cause",
                "Change in people's transit time against the human side-bias multiplier: seeding effect of "
                "crowd-side robots, opposite-side contrast, and density effect",
                "human side-bias multiplier (x fitted beta 0.1)", "change in people's transit (s)", series)


if __name__ == "__main__":
    main()
