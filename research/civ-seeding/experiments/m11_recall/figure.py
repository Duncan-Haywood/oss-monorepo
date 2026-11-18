"""Milestone 11 figure: joint median worst-case regret against tie recall (verdicts.json).

python3 experiments/m11_recall/figure.py   -> recall.svg
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "_shared"))
from linefig import write_lines  # noqa: E402

v = json.load(open(os.path.join(HERE, "verdicts.json")))
q = v["worst_joint_q"]
xs = [0.5, 0.75, 0.85, 1.0]


def name(base, rho, at1):
    return at1 if rho == 1.0 else f"{base}-r{rho:g}"


series = [(label, xs, [100 * q[name(b, x, a)][1] for x in xs]) for label, b, a in [
    ("census top degree", "census-degree", "degree"),
    ("census degree discount", "census-dd", "dd-0.05"),
    ("half survey, half split", "adaptive-dd-0.5", "adaptive-dd-0.5"),
    ("half survey, 3/4 random", "adaptive-dd-0.5-s0.75", "adaptive-dd-0.5-s0.75")]]
write_lines(HERE, "recall.svg",
            "Seeding regret against tie recall (43 BCDJ villages, refitted models)",
            "Median worst-case share of adopters lost, by recall of each tie, for four seeding rules",
            "recall: probability a surveyed household reports a tie (0.85 measured)",
            "median worst-case regret (%)", series, vline=0.85)
