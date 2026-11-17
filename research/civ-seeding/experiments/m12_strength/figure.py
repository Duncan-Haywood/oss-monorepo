"""Milestone 12 figure: name-generator recall by tie-strength stratum (strength.json).

python3 experiments/m12_strength/figure.py   -> strength.svg
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "_shared"))
from linefig import write_lines  # noqa: E402

r = json.load(open(os.path.join(HERE, "strength.json")))["results"]
series = []
for key, label in [("three", "3 questions"),
                   ("borrowmoney", "money"),
                   ("keroricego", "kerosene, rice"),
                   ("visitgo", "visit")]:
    rows = r[key]["strata"]
    series.append((label, list(range(len(rows))), [100 * x["mean"] for x in rows]))
write_lines(HERE, "strength.svg",
            "Tie recall by tie strength (43 BCDJ villages, capture-recapture)",
            "Share of ties a surveyed household names, by how many other questions name the same pair",
            "tie strength: other questions naming the pair (3 questions: of 6, top 2+; one pair: of 10, top 3+)",
            "recall (%)", series)
