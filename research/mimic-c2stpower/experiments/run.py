"""How many trajectories does a C2ST need to see a twin error? Writes results.txt next to this file.

Reuses research/mimic-twinc2st/twin.py. Run: python3 experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "mimic-twinc2st"))
import twin

NS = (100, 200, 400, 800, 1600)
SEEDS = (0, 1, 2, 3)
REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3")
TWINS = [("exact twin (null)", REAL),
         ("coul=0.27 (-10%)", dict(REAL, coul=0.27)),
         ("coul=0.24 (-20%)", dict(REAL, coul=0.24)),
         ("gauss noise, same sd", dict(REAL, kind="gauss"))]
DETS = [("raw", "gboost"), ("raw+resid", "gboost")]
OUT = []


def say(s=""):
    print(s)
    OUT.append(s)


def auc(n, cfg, det, s):
    rng = np.random.default_rng(5000 + s)
    _, _, real = twin.dataset(rng, n, **REAL)
    _, _, tw = twin.dataset(rng, n, **cfg)
    return twin.c2st(real, tw, *det, seed=s)[0]


if __name__ == "__main__":
    say(f"Real system: {REAL}. n real + n twin trajectories of {twin.STEPS} steps, 5-fold CV C2ST AUROC, mean+-sd over seeds {SEEDS}.")
    say("Chance is 0.5. 'detected' = mean AUROC above the null row's mean + 2 sd at the same n (and above 0.55).")
    for det in DETS:
        say()
        say(f"== detector {det[0]}/{det[1]}")
        say(f"{'twin':<24}" + "".join(f"n={n:<10}" for n in NS))
        res = {}
        for label, cfg in TWINS:
            res[label] = [[auc(n, cfg, det, s) for s in SEEDS] for n in NS]
            say(f"{label:<24}" + "".join(f"{np.mean(r):.3f}+-{np.std(r):.3f} " for r in res[label]))
        null = res[TWINS[0][0]]
        for label, _ in TWINS[1:]:
            hit = [n for n, r, z in zip(NS, res[label], null) if np.mean(r) > max(0.55, np.mean(z) + 2 * np.std(z))]
            say(f"smallest n detected, {label}: {hit[0] if hit else 'none up to ' + str(NS[-1])}")
    (HERE / "results.txt").write_text("\n".join(OUT) + "\n")
