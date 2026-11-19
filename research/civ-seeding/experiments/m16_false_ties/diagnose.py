"""Milestone 16, exploratory (written after the run, not a test): why do closure-placed false ties
hurt census top degree more than uniform ones? For each village and placement, at recall 0.85 and
phi = 0.25, 20 census draws: the share of the true top-b degree set (b = the village's leader
count) that the noisy census picks, Kendall's tau between true and noisy degree, and the mean
true degree of the noisy census's top b, and the true ties among the chosen seeds per seed (redundancy:
seeds who are each other's neighbours reach the same households).
python3 experiments/m16_false_ties/diagnose.py   (about 20 s; writes diagnose.txt)"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, seeding as sd  # noqa: E402

V = bcdj.load()
out = ["# Milestone 16 exploratory: census top degree under false ties (recall 0.85, 20 draws per village)",
       "setting | top-b overlap with true top-b | Kendall tau (true, noisy degree) | mean true degree of chosen / of true top-b | true ties among chosen seeds per seed"]
for label, fp, mode in (("no false ties", 0.0, "uniform"), ("phi 0.25 uniform", 0.25, "uniform"),
                        ("phi 0.25 closure", 0.25, "closure"), ("phi 0.5 uniform", 0.5, "uniform"),
                        ("phi 0.5 closure", 0.5, "closure")):
    ov, tau, ratio, red = [], [], [], []
    for v in V:
        b = int(v.leader.sum())
        true_top = sd._top(v.deg.astype(float), b)
        for s in range(20):
            rng = np.random.default_rng([16, v.village, s])
            _, est, _ = sd.survey_recall(v, 1.0, rng, recall=0.85, fp=fp, fp_mode=mode)
            pick = sd._top(est, b)
            ov.append((pick & true_top).sum() / b)
            ratio.append(v.deg[pick].mean() / v.deg[true_top].mean())
            red.append(v.A[np.ix_(pick, pick)].sum() / 2 / b)
            if s < 3:
                tau.append(sd.kendall_tau(v.deg.astype(float), est))
    out.append(f"  {label:18s} | {np.mean(ov):.3f} | {np.mean(tau):.3f} | {np.mean(ratio):.3f} | {np.mean(red):.3f}")
txt = "\n".join(out) + "\n"
open(os.path.join(HERE, "diagnose.txt"), "w").write(txt)
print(txt)
