"""Milestone 15 figure: pooled joint median worst-case regret against tie recall, three rules, ten copies.
python3 experiments/m15_grid/figure.py   (stdlib only; reads verdicts.json, writes grid.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
LAB = {"census-degree": "census top degree", "census-dd": "census degree discount",
       "adaptive-dd-0.5-s0.75": "half survey, 3/4 random"}
series = []
for b, lab in LAB.items():
    pts = [(r, d["rows"][f"{b}-r{r:g}"]["pooled"] * 100) for r in d["grid"]]
    series.append((lab, [x for x, _ in pts], [y for _, y in pts]))
write_lines(HERE, "grid.svg", "Pooled worst-case regret against tie recall (ten Monte Carlo copies)",
            "pooled joint median worst-case regret of three seeding rules at tie recall 0.7 to 0.9",
            "tie recall (share of ties a respondent names)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
