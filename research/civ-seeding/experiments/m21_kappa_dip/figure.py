"""Milestone 21 figure: pooled joint median worst-case regret of census degree discount at phi = 0.25
false ties per true tie placed to close triangles, recall 0.85, against the share kappa of false ties
both ends report: keeping every report (flat by construction), the hard reciprocity filter and the
half weight on one-sided ties, ten Monte Carlo copies; and the half weight on milestone 20's five
copies alone, for comparison.
python3 experiments/m21_kappa_dip/figure.py   (stdlib only; reads verdicts.json, writes kappa.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
rows = d["rows"]
sk, hk = d["soft_kappa"], d["hard_kappa"]
u = rows[d["unfiltered"]]["pooled"] * 100
series = [
    ("keep every report", sk, [u] * len(sk)),
    ("drop one-sided ties", hk, [rows[d["hard"][f"{k}"]]["pooled"] * 100 for k in hk]),
    ("half weight, ten copies", sk, [rows[d["soft"][f"{k}"]]["pooled"] * 100 for k in sk]),
    ("half weight, copies 0-4 only", sk, [rows[d["soft"][f"{k}"]]["pooled_0_4"] * 100 for k in sk]),
]
write_lines(HERE, "kappa.svg",
            "Is the dip real? Half weight on one-sided ties at one false tie per four (census degree discount)",
            "pooled joint median worst-case regret of census degree discount against the share of false ties both ends report, at one triangle-closing false tie per four true ones and recall 0.85, for keeping every report, dropping one-sided ties and keeping them at half weight, over ten Monte Carlo copies and over the first five alone",
            "share of false ties both ends report (kappa)", "joint median worst-case regret (%)", series)
