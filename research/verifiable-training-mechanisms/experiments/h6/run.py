"""Milestone 7a (H6): does a model fitted on the honest run alone predict the measured skip degradation?

Run from this directory:  OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (about 1 minute)
Reads ../margin/results.json (measured, reorder referee, skip shortcut). Writes results.json and results.txt.

Two predictors that see only the honest runs (no cheating run, no refit on the measured gaps):
  A first-order: a skipped step forgoes the descent it would have bought; for an SGD step d = -lr g the
    first-order loss drop is lr |g|^2 = |d|^2 / lr, so the predicted degradation is the mean over seeds
    of sum_{t: |d_t| <= tau} |d_t|^2 / lr_t, scaled by the held-out/train ratio of 1 (no scaling).
  B fewer steps: the skipping worker has done (1 - f(tau)) T steps of the schedule, f(tau) the honest share of
    steps with |d_t| <= tau; predict the degradation as the loss of an honest worker trained with
    round((1 - f) T) steps on the same cosine schedule (compressed) minus the honest loss."""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import load_digits_split, loss, lr_at, train  # noqa: E402

SEEDS, T, LR0 = 20, 1500, 0.2
DATA = load_digits_split()
meas = json.load(open(os.path.join(HERE, "..", "margin", "results.json")))
TAUS = meas["taus"]
rows = {r["tau"]: r for r in meas["cheat"]["reorder/skip"]}
lrs = np.array([lr_at(t, T, LR0) for t in range(T)])

honest, norms = [], []
for s in range(SEEDS):
    w, info = train(DATA, s, record=True)
    honest.append(loss(w, DATA[2], DATA[3]))
    norms.append(np.array(info["norms"]))
honest = np.array(honest)
out = []
for tau in TAUS:
    a = float(np.mean([np.sum(n[n <= tau] ** 2 / lrs[n <= tau]) for n in norms]))
    f = float(np.mean([np.mean(n <= tau) for n in norms]))
    steps = max(1, int(round((1 - f) * T)))  # train() divides by steps; 1 step stands in for 0
    lb = np.array([loss(train(DATA, s, steps=steps)[0], DATA[2], DATA[3]) for s in range(SEEDS)]) - honest
    m = rows[tau]
    out.append({"tau": tau, "frac": f, "measured": m["deg_mean"], "ci": [m["deg_lo"], m["deg_hi"]],
                "pred_A": a, "pred_B": float(lb.mean())})
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
std = float(honest.std(ddof=1))
lines = [f"honest loss {honest.mean():.4f}, seed std {std:.4f}; skip shortcut, reorder referee",
         "tau       skipped  measured [95% CI]               predA      A/meas  predB      B/meas  in [0.5,2] A,B  (only where |measured| > seed std)"]
for r in out:
    den = r["measured"] or float("nan")
    ra, rb = r["pred_A"] / den, r["pred_B"] / den
    big = abs(r["measured"]) > std
    ok = lambda x: "yes" if 0.5 <= x <= 2 else "no"
    lines.append(f"{r['tau']:<9.0e} {r['frac']:<8.3f} {r['measured']:+.5f} [{r['ci'][0]:+.5f},{r['ci'][1]:+.5f}]  "
                 f"{r['pred_A']:+.5f} {ra:8.2f}  {r['pred_B']:+.5f} {rb:8.2f}  {ok(ra)},{ok(rb)}  {'scored' if big else 'below noise'}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
