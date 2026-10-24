"""Does the swing-up result of mimic-twinswing (detectability does not predict tuning regret) survive a finer gain grid?

    python experiments/run.py      # about 10 minutes on 4 CPUs; writes results.txt and results.json next to this file

Same twins, same tuning and held-out protocol as ../mimic-twinswing/experiments/run.py, with a 144-point grid
instead of 60. AUROC and paired RMSE are not recomputed: the passive-trajectory classifier does not depend on the
controller grid, so they are read from twinswing_results.json (a copy of mimic-twinswing's committed results.json) (same twin list and seeds).
"""
import json
import sys
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twin

SEEDS = range(12)
N_EVAL = 600
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


gains = twin.gain_grid(kes=(0.5, 1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0), kps=(10.0, 20.0, 40.0), kds=(1.0, 2.0, 4.0), caps=(0.4, 0.8))
old = {r["twin"]: r for r in json.loads((HERE / "twinswing_results.json").read_text())}

# real-system cost of every grid point, per seed: shared by all twins (same held-out starts and noise)
real_cost = {}
for s in SEEDS:
    ev = np.random.default_rng(20_000 + s)
    real_cost[s] = twin.swing_cost(twin.draw_starts(ev, N_EVAL), gains, R, ev)
best = float(np.mean([c.min() for c in real_cost.values()]))

rows = []
for name, cfg in TWINS:
    regrets, picks = [], []
    for s in SEEDS:
        i, _ = twin.tune(cfg, np.random.default_rng(10_000 + s), n=150, gains=gains)
        regrets.append(float(real_cost[s][i] - real_cost[s].min())); picks.append(gains[i])
    o = old[name]
    rows.append(dict(twin=name, auroc=o["auroc"], rmse=o["rmse"], regret=float(np.mean(regrets)),
                     regret_sd=float(np.std(regrets)), regret_med=float(np.median(regrets)),
                     regret_coarse=o["regret"], gains=[list(g) for g in picks]))
    print(name, rows[-1]["regret"], flush=True)

base = next(r for r in rows if r["twin"].startswith("exact"))["regret"]
say(f"Real system: {R}. Swing-up grid of {len(gains)} controllers (ke, kp, kd, cap), tuned on 150 twin starts, scored on {N_EVAL} held-out real starts.")
say(f"Mean best real cost on the fine grid: {best:.4f} (mimic-twinswing, 60-point grid: 0.353 for its own best point).")
say(f"Regret = real cost of the twin-tuned controller minus the best of the fine grid on the real system. Mean and sd over {len(SEEDS)} tuning seeds.")
say("AUROC and paired RMSE are copied from mimic-twinswing/experiments/results.json.")
say()
say(f"{'twin':<26}{'AUROC':>7}{'regret':>10}{'sd':>9}{'median':>9}{'coarse':>9}{'regret-null':>13}")
for r in rows:
    say(f"{r['twin']:<26}{r['auroc']:>7.3f}{r['regret']:>10.5f}{r['regret_sd']:>9.5f}{r['regret_med']:>9.5f}{r['regret_coarse']:>9.5f}{r['regret'] - base:>13.5f}")
ok = [r for r in rows if not r["twin"].startswith("exact")]
for key in ("auroc", "rmse"):
    rho, p = spearmanr([r[key] for r in ok], [r["regret"] for r in ok])
    say(f"Spearman({key}, fine-grid regret) over {len(ok)} wrong twins: rho={rho:.2f}, p={p:.3f}")
rho, p = spearmanr([r["regret"] for r in ok], [r["regret_coarse"] for r in ok])
say(f"Spearman(fine-grid regret, coarse-grid regret): rho={rho:.2f}, p={p:.3f}")
(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
(HERE / "results.json").write_text(json.dumps(rows, indent=1))
