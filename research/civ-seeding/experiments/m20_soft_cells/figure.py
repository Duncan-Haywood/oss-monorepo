"""Milestone 20 figure: pooled joint median worst-case regret of census degree discount against the
share kappa of false ties both ends report, unfiltered (flat by construction), hard reciprocity filter
and half weight on one-sided ties, in the two false-tie cells (phi = 0.25 triangle-closing, phi = 0.5
random placement), recall 0.85.
python3 experiments/m20_soft_cells/figure.py   (stdlib only; reads verdicts.json, writes cells.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
ks = d["kappa"]
series = []
for phi, mode, lab in ((0.25, "closure", "1 per 4, closing triangles"), (0.5, "uniform", "1 per 2, random")):
    base = f"census-dd-r0.85-fp{phi:g}-{mode}"
    rows = d["rows"]
    u = rows[base]["pooled"] * 100
    series.append((f"{lab}: keep all", ks, [u] * len(ks)))
    for tag, w in (("drop one-sided", ""), ("half weight", "-w0.5")):
        ys = [rows[base + "-recip" + (f"-j{k:g}" if k else "") + w]["pooled"] * 100 for k in ks]
        series.append((f"{lab}: {tag}", ks, ys))
write_lines(HERE, "cells.svg",
            "Half weight on one-sided ties, two more false-tie cells (census degree discount, recall 0.85)",
            "pooled joint median worst-case regret of census degree discount against the share of false ties both ends report, for keeping every report, dropping one-sided ties and keeping them at half weight, at one false tie per four true ones closing triangles and one per two placed at random",
            "share of false ties both ends report (kappa)", "joint median worst-case regret (%)",
            series, hline=d["ref"]["degree"] * 100)
