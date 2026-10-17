"""Biased vs IPS vs full-information fits on the same history. Writes experiments/results.txt."""
import numpy as np

from ambient_fullinfo.core import (INFORMED_W, PRIOR_W, World, oracle_weights, run_fixed, run_logged, simulate)

SEEDS = 20
H = 100
HOURS = (20, 50, 100)
EPS = [0.002, 0.005, 0.02]
PRIORS = {"uninformed": PRIOR_W, "informed": INFORMED_W}
NAMES = ["biased", "ips", "full"]
out = []


def log(s=""):
    print(s); out.append(s)


def ms(x):
    return f"{np.mean(x):6.2f} +- {np.std(x):5.2f}"


wd = World()
wo = oracle_weights(wd, np.random.default_rng(12345), 2000)
held = [simulate(wd, 100, np.random.default_rng(5000 + s)) for s in range(SEEDS)]
oracle_held = np.mean([run_fixed(wd, h, wo).sum() / 100 for h in held])
log(f"oracle weights [score, keyword, others, intercept] = {np.round(wo, 3).tolist()}; oracle utility/h on held-out {oracle_held:.2f}")
log(f"{SEEDS} seeds, {H} h streams; each fit is scored on fresh 100 h held-out streams with no exploration; '+-' is the std over seeds")
log("columns: held-out utility/h of the fit | L2 distance of its weights to the oracle weights | labelled windows seen")
for hour in HOURS:
    log(f"\n== fits at hour {hour}")
    log(f"{'prior':11s} {'eps':>6s} {'fit':>7s} {'utility/h':>15s} {'dist to oracle':>16s} {'labelled':>9s}")
    for pname, pw in PRIORS.items():
        for eps in EPS:
            res = {k: ([], []) for k in NAMES}; nl = []
            for s in range(SEEDS):
                d = simulate(wd, H, np.random.default_rng(1000 + s))
                fits, nlab = run_logged(wd, d, np.random.default_rng(s), eps=eps, prior_w=pw, hours=HOURS)
                nl.append(nlab[hour])
                for k in NAMES:
                    w = fits[hour][k]
                    res[k][0].append(run_fixed(wd, held[s], w).sum() / 100)
                    res[k][1].append(np.linalg.norm(w - wo))
            for k in NAMES:
                log(f"{pname:11s} {eps:6.3f} {k:>7s} {ms(res[k][0]):>15s} {ms(res[k][1]):>16s} {np.mean(nl):9.0f}")
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
