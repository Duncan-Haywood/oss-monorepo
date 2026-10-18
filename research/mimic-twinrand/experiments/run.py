"""Does tuning on a spread of twins (domain randomization) cut the regret of tuning on one wrong twin?

    python experiments/run.py      # a few minutes on 1 CPU; writes results.txt and results.json next to this file
"""
import json
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twinrand
twin = twinrand.twin

SEEDS = range(24)
N_EVAL = 2000
WIDTHS = (0.0, 0.25, 0.5, 1.0, 2.0)
R = twinrand.REAL
NOMINALS = [
    ("exact twin", dict(R)),
    ("no sensor noise", dict(R, sd=0.0)),
    ("noise sd x2", dict(R, sd=0.04)),
    ("no Coulomb friction", dict(R, coul=0.0)),
    ("g/L +20%", dict(R, glo=9.81 * 1.2)),
]
OUT = []


def say(s=""):
    print(s)
    OUT.append(s)


gains = twin.gain_grid()
evals = []
for s in SEEDS:                       # one held-out real-system evaluation per seed, shared by every condition
    ev = np.random.default_rng(20_000 + s)
    th0 = ev.uniform(-2.0, 2.0, N_EVAL)
    evals.append(twin.closed_loop_cost(th0, gains, R, ev))

rows = []
for name, nom in NOMINALS:
    for w in WIDTHS:
        reg, picks = [], []
        for s in SEEDS:
            i, _ = twinrand.tune_dr(nom, w, np.random.default_rng(10_000 + s), gains=gains)
            reg.append(float(evals[s][i] - evals[s].min())); picks.append(list(gains[i]))
        rows.append(dict(nominal=name, width=w, regret=float(np.mean(reg)), sd=float(np.std(reg)),
                         worst=float(np.max(reg)), zero=int(sum(r == 0 for r in reg)), gains=picks))
        print(name, w, rows[-1]["regret"], flush=True)

best = min(float(e.min()) for e in evals)
say(f"Real system: {R}. PD grid of {len(gains)} pairs; tuned on 200 start angles spread over 8 twins; scored on {N_EVAL} held-out real start angles.")
say(f"Randomized twin: every parameter (sd, coul, visc, g/L) uniform on nominal +- width x its real value (clipped at 0). Regret as in mimic-twinregret. {len(SEEDS)} tuning seeds.")
say(f"Best real cost on the grid (mean of per-seed minima): {np.mean([e.min() for e in evals]):.4f}")
say()
say(f"{'nominal twin':<22}{'width':>6}{'regret':>10}{'sd':>9}{'worst':>9}{'seeds at 0':>12}")
for r in rows:
    say(f"{r['nominal']:<22}{r['width']:>6.2f}{r['regret']:>10.5f}{r['sd']:>9.5f}{r['worst']:>9.5f}{r['zero']:>9}/{len(SEEDS)}")
Path(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
Path(HERE / "results.json").write_text(json.dumps(rows))
