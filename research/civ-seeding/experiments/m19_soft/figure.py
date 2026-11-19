"""Milestone 19 figure: pooled joint median worst-case regret of the two census rules against the
weight w kept on one-sided checkable ties (w = 0 the hard reciprocity filter, w = 1 every report,
which is the unfiltered census by construction), one line per share kappa of false ties both ends
report (triadic-closure placement, phi = 0.5, recall 0.85).
python3 experiments/m19_soft/figure.py   (stdlib only; reads verdicts.json, writes soft.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
LAB = {"census-degree": "census top degree", "census-dd": "census degree discount"}
ws = d["w"] + [1.0]
series = []
for b, lab in LAB.items():
    base = f"{b}-r0.85-fp0.5-closure"
    for k in d["kappa"]:
        ys = [d["rows"][base + "-recip" + (f"-j{k:g}" if k else "") + (f"-w{w:g}" if w else "")]["pooled"] * 100
              for w in d["w"]]
        series.append((f"{lab}, kappa {k:g}", ws, ys + [d["rows"][base]["pooled"] * 100]))
write_lines(HERE, "soft.svg",
            "Soft reciprocity filter: weight on one-sided ties (closure, one false tie per two true, recall 0.85)",
            "pooled joint median worst-case regret of census top degree and census degree discount as the weight kept on ties only one end names rises from 0 (hard filter) to 1 (every report kept), one line per share kappa of false ties both ends report",
            "weight on one-sided ties (0 = drop, 1 = keep)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
