"""Does randomizing only the noise level beat randomizing all four parameters?

    python experiments/run.py      # a few minutes on 1 CPU; writes results.txt and results.json next to this file
The all-four rows are re-run here with the same seeds and held-out evaluations as `mimic-twinrand`, so the comparison is paired.
"""
import json
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import twinnoiserand as tn
twin, twinrand = tn.twin, tn.twinrand

SEEDS = range(24)
N_EVAL = 2000
WIDTHS = (0.0, 0.5, 1.0, 2.0, 4.0)
R = tn.REAL
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
for s in SEEDS:
    ev = np.random.default_rng(20_000 + s)
    evals.append(twin.closed_loop_cost(ev.uniform(-2.0, 2.0, N_EVAL), gains, R, ev))

rows = []
for name, nom in NOMINALS:
    for scheme, tune in (("noise only", tn.tune_noise_dr), ("all four", twinrand.tune_dr)):
        for w in WIDTHS:
            reg = []
            for s in SEEDS:
                i, _ = tune(nom, w, np.random.default_rng(10_000 + s), gains=gains)
                reg.append(float(evals[s][i] - evals[s].min()))
            rows.append(dict(nominal=name, scheme=scheme, width=w, regret=float(np.mean(reg)), sd=float(np.std(reg)),
                             worst=float(np.max(reg)), zero=int(sum(r == 0 for r in reg))))
            print(name, scheme, w, rows[-1]["regret"], flush=True)

say(f"Real system: {R}. PD grid of {len(gains)} pairs; tuned on 200 start angles over 8 twins; scored on {N_EVAL} held-out real start angles; {len(SEEDS)} seeds.")
say("noise only: sd uniform on nominal +- width x 0.02 (clipped at 0), other parameters at nominal. all four: as mimic-twinrand.")
say()
say(f"{'nominal twin':<22}{'scheme':<12}{'width':>6}{'regret':>10}{'sd':>9}{'worst':>9}{'seeds at 0':>12}")
for r in rows:
    say(f"{r['nominal']:<22}{r['scheme']:<12}{r['width']:>6.2f}{r['regret']:>10.5f}{r['sd']:>9.5f}{r['worst']:>9.5f}{r['zero']:>9}/{len(SEEDS)}")
Path(HERE / "results.txt").write_text("\n".join(OUT) + "\n")
Path(HERE / "results.json").write_text(json.dumps(rows))
