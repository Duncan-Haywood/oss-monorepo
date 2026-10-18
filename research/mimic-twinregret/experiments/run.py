"""Does a twin's fidelity score predict what a controller tuned on it costs on the real system?

    python experiments/run.py      # a few minutes on 4 CPUs; writes results.txt and results.json next to this file
"""
import json
import sys
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

SEEDS = range(12)          # tuning seeds (controller regret)
C2ST_SEEDS, N_C2ST = (0, 1, 2), 800
N_EVAL = 2000
R = twin.REAL
TWINS = [
    ("exact twin (null)", dict(R)),
    ("coul -10%", dict(R, coul=0.27)), ("coul -20%", dict(R, coul=0.24)), ("coul -33%", dict(R, coul=0.2)),
    ("coul -67%", dict(R, coul=0.1)), ("coul = 0", dict(R, coul=0.0)),
    ("visc x2", dict(R, visc=0.2)), ("visc x0.5", dict(R, visc=0.05)),
    ("g/L +20%", dict(R, glo=9.81 * 1.2)), ("g/L -20%", dict(R, glo=9.81 * 0.8)),
    ("gauss noise, same sd", dict(R, kind="gauss")),
    ("noise sd x0.5", dict(R, sd=0.01)), ("noise sd x0.75", dict(R, sd=0.015)),
    ("noise sd x1.5", dict(R, sd=0.03)), ("noise sd x2", dict(R, sd=0.04)), ("noise sd x0 (no noise)", dict(R, sd=0.0)),
]
OUT = []


def say(s=""):
    print(s)
    OUT.append(s)


gains = twin.gain_grid()
rows = []
for name, cfg in TWINS:
    regrets, picks = [], []
    for s in SEEDS:
        i, _ = twin.tune(cfg, np.random.default_rng(10_000 + s), gains=gains)
        ev = np.random.default_rng(20_000 + s)          # held-out start angles and real noise, shared by all gains
        th0 = ev.uniform(-2.0, 2.0, N_EVAL)
        j = twin.closed_loop_cost(th0, gains, R, ev)
        regrets.append(float(j[i] - j.min())); picks.append(gains[i])
    aucs, rm = [], []
    for s in C2ST_SEEDS:
        rng = np.random.default_rng(1000 + s)
        th0, clean, real = twin.passive(rng, N_C2ST, R)
        _, _, tw = twin.passive(rng, N_C2ST, cfg)
        aucs.append(twin.c2st(real, tw, seed=s))
        rm.append(twin.paired_rmse(th0, clean, cfg))
    rows.append(dict(twin=name, auroc=float(np.mean(aucs)), auroc_sd=float(np.std(aucs)), rmse=float(np.mean(rm)),
                     regret=float(np.mean(regrets)), regret_sd=float(np.std(regrets)),
                     regret_med=float(np.median(regrets)), gains=[list(g) for g in picks]))
    print(name, rows[-1]["auroc"], rows[-1]["regret"], flush=True)

base = next(r for r in rows if r["twin"].startswith("exact"))["regret"]
say(f"Real system: {R}. PD gain grid of {len(gains)} pairs, tuned on 200 twin start angles, scored on {N_EVAL} held-out real start angles.")
say(f"Regret = real cost of the twin-tuned gains minus the best gain in the grid on the real system (cost units: rad^2 plus {twin.U_COST} u^2, time-averaged).")
say(f"Mean and sd over {len(SEEDS)} tuning seeds. AUROC: boosted trees on raw + second differences, {N_C2ST} vs {N_C2ST}, mean over seeds {C2ST_SEEDS}.")
say()
say(f"{'twin':<26}{'AUROC':>7}{'pairedRMSE':>12}{'regret':>10}{'sd':>9}{'median':>9}{'regret-null':>13}")
for r in rows:
    say(f"{r['twin']:<26}{r['auroc']:>7.3f}{r['rmse']:>12.5f}{r['regret']:>10.5f}{r['regret_sd']:>9.5f}{r['regret_med']:>9.5f}{r['regret'] - base:>13.5f}")
ok = [r for r in rows if not r["twin"].startswith("exact")]
for key in ("auroc", "rmse"):
    rho, p = spearmanr([r[key] for r in ok], [r["regret"] for r in ok])
    say(f"Spearman({key}, regret) over {len(ok)} wrong twins: rho={rho:.2f}, p={p:.3f}")
(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
(HERE / "results.json").write_text(json.dumps(rows, indent=1))
