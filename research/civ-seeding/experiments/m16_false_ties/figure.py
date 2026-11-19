"""Milestone 16 figure: pooled joint median worst-case regret against the false-tie rate phi,
three rules x two placements, five copies.
python3 experiments/m16_false_ties/figure.py   (stdlib only; reads verdicts.json, writes false_ties.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
LAB = {"census-degree": "census top degree", "census-dd": "census degree discount",
       "adaptive-dd-0.5-s0.75": "half survey"}
series = []
for b, lab in LAB.items():
    for mode in d["modes"]:
        xs = [0.0] + d["phi"]
        ys = [d["rows"][f"{b}-r0.85"]["pooled"] * 100] + [
            d["rows"][f"{b}-r0.85-fp{ph:g}-{mode}"]["pooled"] * 100 for ph in d["phi"]]
        series.append((f"{lab}, {mode}", xs, ys))
write_lines(HERE, "false_ties.svg", "Pooled worst-case regret against the false-tie rate (recall 0.85, five copies)",
            "pooled joint median worst-case regret of three seeding rules as respondents name false ties, uniform or triadic-closure placement",
            "false ties named per true tie (phi)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
