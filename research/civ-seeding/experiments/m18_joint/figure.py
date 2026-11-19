"""Milestone 18 figure: pooled joint median worst-case regret of the two census rules against the
share kappa of false ties both ends report (triadic-closure placement, phi = 0.5, recall 0.85), with
the reciprocity filter, beside the unfiltered census (identical at every kappa by construction).
python3 experiments/m18_joint/figure.py   (stdlib only; reads verdicts.json, writes joint.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
LAB = {"census-degree": "census top degree", "census-dd": "census degree discount"}
ks = d["kappa"]["closure"]
series = []
for b, lab in LAB.items():
    base = f"{b}-r0.85-fp0.5-closure"
    ys = [d["rows"][base + "-recip" + (f"-j{k:g}" if k else "")]["pooled"] * 100 for k in ks]
    series.append((f"{lab}, reciprocated only", ks, ys))
    series.append((f"{lab}, as reported", ks, [d["rows"][base]["pooled"] * 100] * len(ks)))
write_lines(HERE, "joint.svg",
            "Reciprocity filter against correlated false ties (closure, one false tie per two true, recall 0.85)",
            "pooled joint median worst-case regret of census top degree and census degree discount as the share of false ties reported by both ends grows, with only reciprocated ties kept or every reported tie kept",
            "share of false ties both ends report (kappa)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
