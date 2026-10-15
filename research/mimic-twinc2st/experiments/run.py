"""C2ST vs paired RMSE as fidelity scores for pendulum twins. Writes results.txt next to this file.

    python experiments/run.py      # about 7 minutes on 4 CPUs
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

N, SEEDS = 800, (0, 1, 2)
REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3")
DETECTORS = [("raw", "logreg"), ("raw", "gboost"), ("raw+resid", "gboost")]
OUT = []


def say(s=""):
    print(s)
    OUT.append(s)


def row(label, twin_cfg):
    rm, res = [], {d: [] for d in DETECTORS}
    for s in SEEDS:
        rng = np.random.default_rng(1000 + s)
        th0, clean, real = twin.dataset(rng, N, **REAL)
        _, _, tw = twin.dataset(rng, N, **twin_cfg)
        rm.append(twin.paired_rmse(th0, clean, twin_cfg["visc"], twin_cfg["coul"]))
        for f, m in DETECTORS:
            res[(f, m)].append(twin.c2st(real, tw, f, m, seed=s)[0])
    cells = "  ".join(f"{np.mean(res[d]):.3f}+-{np.std(res[d]):.3f}" for d in DETECTORS)
    say(f"{label:<28}{np.mean(rm):>10.5f}  {cells}")


def header(t):
    say()
    say(f"== {t}")
    say(f"{'twin':<28}{'pairedRMSE':>10}  " + "  ".join(f"{f}/{m}".ljust(16) for f, m in DETECTORS))


say(f"Real system: {REAL}. {N} real + {N} twin trajectories of {twin.STEPS} steps (dt {twin.DT}), 5-fold CV C2ST AUROC, mean+-sd over seeds {SEEDS}.")
say("Chance AUROC is 0.5. paired RMSE = noise-free twin vs noise-free real from the same start angle (radians).")

header("1. Coulomb-friction mismatch (noise model correct)")
for c in (0.3, 0.27, 0.24, 0.2, 0.1, 0.0):
    row(f"coul={c}", dict(REAL, coul=c))

header("2. Noise-shape mismatch (dynamics exact, Gaussian noise of the same sd)")
row("gauss noise, sd=0.02", dict(REAL, kind="gauss"))
row("exact twin (null)", dict(REAL))

header("3. Noise-level mismatch (dynamics exact, Student-t noise)")
for sd in (0.015, 0.018, 0.022, 0.025):
    row(f"sd={sd}", dict(REAL, sd=sd))

(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
