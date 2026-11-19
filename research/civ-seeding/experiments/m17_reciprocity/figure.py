"""Milestone 17 figure: pooled joint median worst-case regret against the false-tie rate phi under
triadic-closure placement, three rules with and without the reciprocity filter, five copies.
python3 experiments/m17_reciprocity/figure.py   (stdlib only; reads verdicts.json, writes reciprocity.svg)"""
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
    for suf, tag in (("", "as reported"), ("-recip", "reciprocated only")):
        xs = [0.0] + d["phi"]
        ys = [d["rows"][f"{b}-r0.85{suf}"]["pooled"] * 100] + [
            d["rows"][f"{b}-r0.85-fp{ph:g}-closure{suf}"]["pooled"] * 100 for ph in d["phi"]]
        series.append((f"{lab}, {tag}", xs, ys))
write_lines(HERE, "reciprocity.svg",
            "Worst-case regret with and without the reciprocity filter (closure false ties, recall 0.85)",
            "pooled joint median worst-case regret of three seeding rules as respondents name triadic-closure false ties, with every reported tie kept or only reciprocated ones",
            "false ties named per true tie (phi)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
