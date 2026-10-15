"""C2ST vs paired RMSE for MuJoCo pendulum twins that differ in integrator, timestep or friction.

    python experiments/run.py      # writes results.txt next to this file (a few minutes on 4 CPUs)
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

N, SEEDS, SD = 800, (0, 1, 2), 0.02
REAL = dict(integrator="rk4", dt=0.002, damping=0.025, frictionloss=0.075)
TWINS = [
    ("exact twin (null)", dict(REAL), "student3"),
    ("rk4 dt=0.02", dict(REAL, dt=0.02), "student3"),
    ("euler dt=0.002", dict(REAL, integrator="euler", dt=0.002), "student3"),
    ("euler dt=0.005", dict(REAL, integrator="euler", dt=0.005), "student3"),
    ("euler dt=0.01", dict(REAL, integrator="euler", dt=0.01), "student3"),
    ("euler dt=0.02", dict(REAL, integrator="euler", dt=0.02), "student3"),
    ("frictionloss -10%", dict(REAL, frictionloss=0.0675), "student3"),
    ("frictionloss -20%", dict(REAL, frictionloss=0.06), "student3"),
    ("frictionloss 0", dict(REAL, frictionloss=0.0), "student3"),
    ("exact, gauss noise", dict(REAL), "gauss"),
]
OUT = []


def say(s=""):
    print(s, flush=True)
    OUT.append(s)


say(f"Real: MuJoCo {REAL}, Student-t(3) sensor noise sd {SD} rad. {N} real + {N} twin trajectories of {twin.STEPS} samples at {twin.SAMPLE_DT} s.")
say(f"C2ST: boosted trees on raw+second-difference features, 5-fold CV AUROC, mean+-sd over seeds {SEEDS}. Chance is 0.5.")
say("paired RMSE: noise-free twin vs noise-free real from the same start angle (rad); the noise sd is 0.02.")
say(f"{'twin':<22}{'pairedRMSE':>11}{'C2ST AUROC':>16}")
for label, cfg, kind in TWINS:
    rm, au = [], []
    for s in SEEDS:
        rng = np.random.default_rng(3000 + s)
        th = rng.uniform(-2, 2, N)
        real_clean = twin.simulate(th, **REAL)
        real = real_clean + twin.noise(rng, real_clean.shape, SD, "student3")
        th2 = rng.uniform(-2, 2, N)  # independent start angles for the twin sample: the C2ST needs no pairing
        tw = twin.simulate(th2, **cfg)
        tw = tw + twin.noise(rng, tw.shape, SD, kind)
        rm.append(twin.paired_rmse(twin.simulate(th, **cfg), real_clean))
        au.append(twin.c2st(real, tw, seed=s))
    say(f"{label:<22}{np.mean(rm):>11.5f}{np.mean(au):>10.3f}+-{np.std(au):.3f}")
(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
