"""Experiments for sensing-thermalfuse. Writes experiments/results.txt (about 4 minutes on one CPU core).

    PYTHONPATH=src python experiments/run.py
"""
import os
import sys
from dataclasses import replace
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from sensing_thermalfuse import Setup, train_detectors, evaluate  # noqa: E402

SEEDS = (0, 1, 2)
N_TRAIN, N_TEST = 40, 150
out = []


def p(line=""):
    out.append(line)
    print(line, flush=True)


def mean_rng(vals):
    return f"{np.mean(vals):.2f} [{np.min(vals):.2f}-{np.max(vals):.2f}]"


p("# sensing-thermalfuse: person recall from RGB, thermal and fused detectors (synthetic scenes)")
p(f"# {N_TRAIN} training scenes and {N_TEST}+{N_TEST} test scenes per cell, seeds {SEEDS}; recall at 10% false alarms per person-free image")
p("# cells are mean [min-max] over seeds; detectors are retrained at every light and smoke setting")
p()
p("## A. recall by light level and smoke (visible transmittance), aligned cameras")
p("light  smoke_t  rgb  thermal  early  late")
for light in (1.0, 0.03, 0.001):
    for t in (1.0, 0.4, 0.1):
        s = Setup(light=light, smoke_t=t)
        r = {k: [] for k in ("rgb", "thermal", "early", "late")}
        for sd in SEEDS:
            res = evaluate(train_detectors(s, N_TRAIN, 100 + sd), s, N_TEST, 200 + sd)
            for k in r:
                r[k].append(res[k])
        p(f"{light:<6g} {t:<8g} " + "  ".join(mean_rng(r[k]) for k in ("rgb", "thermal", "early", "late")))
p()

SHIFTS = (0, 1, 2, 3, 4, 6, 8)
for tag, light, t in (("B1", 1.0, 1.0), ("B2", 0.001, 1.0)):
    p(f"## {tag}. recall against thermal camera displacement (RGB pixels; person ~5 px wide, thermal pixel = 4 px), light {light:g}, smoke_t {t:g}")
    p("shift  rgb  thermal  early_aligned  early_jitter4  late_aligned")
    rows = {sh: {k: [] for k in ("rgb", "thermal", "early", "early_j", "late")} for sh in SHIFTS}
    for sd in SEEDS[:2]:
        s = Setup(light=light, smoke_t=t)
        da = train_detectors(s, N_TRAIN, 300 + sd)
        dj = train_detectors(s, N_TRAIN, 300 + sd, jitter=4.0)
        dets = {"rgb": da["rgb"], "thermal": da["thermal"], "early": da["early"], "early_j": dj["early"], "late": da["late"]}
        for sh in SHIFTS:
            res = evaluate(dets, replace(s, shift=float(sh)), N_TEST, 400 + sd)
            for k in rows[sh]:
                rows[sh][k].append(res[k])
    for sh in SHIFTS:
        p(f"{sh:<5d}  " + "  ".join(f"{np.mean(rows[sh][k]):.2f}" for k in ("rgb", "thermal", "early", "early_j", "late")))
    p()

with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
