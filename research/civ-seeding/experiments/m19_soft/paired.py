"""Milestone 19, post hoc (not a planned test): soft minus hard filter for both census rules at
each kappa, pooled difference and Monte Carlo se from the five paired copies in verdicts.json.
python3 experiments/m19_soft/paired.py   (needs numpy; writes paired.txt)"""
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, "verdicts.json")))["rows"]
out = ["# soft (w) minus hard (w = 0) filter, both census rules, closure, phi = 0.5, recall 0.85 (post hoc)"]
for base in ("census-dd", "census-degree"):
    b = f"{base}-r0.85-fp0.5-closure-recip"
    for k in ("", "-j0.5", "-j1"):
        h = rows[b + k]
        for w in ("0.25", "0.5", "0.75"):
            s = rows[f"{b}{k}-w{w}"]
            d = np.array(s["copies"]) - np.array(h["copies"])
            se = d.std(ddof=1) / np.sqrt(len(d))
            dp = s["pooled"] - h["pooled"]
            out.append(f"  {base:14s} kappa {k[2:] or '0':4s} w {w:5s}: {dp * 100:+.2f} (se {se * 100:.2f}, z {dp / se:+.1f})")
txt = "\n".join(out) + "\n"
open(os.path.join(HERE, "paired.txt"), "w").write(txt)
print(txt)
