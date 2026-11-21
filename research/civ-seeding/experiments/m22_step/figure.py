"""Milestone 22 figure: pooled worst-case regret of census degree discount at phi = 0.25 false ties
per true tie (closure), recall 0.85, against the share kappa of false ties both ends report, ten
Monte Carlo copies: keeping every report (flat by construction), the half weight on one-sided ties
(joint median and mean over draws), and the oracle that halves only one-sided false ties.
python3 experiments/m22_step/figure.py   (stdlib only; reads verdicts.json, writes step.svg)"""
import json
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from linefig import write_lines  # noqa: E402

d = json.load(open(os.path.join(HERE, "verdicts.json")))
rows = d["rows"]
sk, ok = d["soft_kappa"], d["oracle_kappa"]
u = rows[d["unfiltered"]]
series = [
    ("keep every report", sk, [u["pooled"] * 100] * len(sk)),
    ("half weight, median", sk, [rows[d["soft"][f"{k}"]]["pooled"] * 100 for k in sk]),
    ("half weight, mean over draws", sk, [rows[d["soft"][f"{k}"]]["mean"] * 100 for k in sk]),
    ("oracle: halve only false one-sided ties", ok, [rows[d["oracle"][f"{k}"]]["pooled"] * 100 for k in ok]),
]
write_lines(HERE, "step.svg",
            "Where the half weight's step sits (census degree discount, one false tie per four)",
            "pooled worst-case regret of census degree discount against the share of false ties both ends report, at one triangle-closing false tie per four true ones and recall 0.85, ten Monte Carlo copies: keeping every report, the half weight on one-sided ties as joint median and as mean over draws, and an oracle that halves only one-sided false ties",
            "share of false ties both ends report (kappa)", "worst-case regret (%)", series)
