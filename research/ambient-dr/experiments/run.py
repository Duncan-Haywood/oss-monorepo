"""Doubly robust pseudo-labels against IPS, clipped and biased fits. Writes experiments/results.txt."""
import numpy as np

from ambient_dr.core import FIT_NAMES, INFORMED_W, PRIOR_W, World, oracle_weights, run_fixed, run_logged, simulate

SEEDS = 20
H = 100
EPS = [0.002, 0.005, 0.02]
PRIORS = {"uninformed": PRIOR_W, "informed": INFORMED_W}
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
log(f"{SEEDS} seeds, fits at hour {H}; scored on fresh 100 h held-out streams with no exploration; '+-' is the std over seeds")
log("columns: held-out utility/h | L2 distance of weights to oracle weights | labelled windows")
log(f"{'prior':11s} {'eps':>6s} {'fit':>15s} {'utility/h':>15s} {'dist to oracle':>16s} {'labelled':>9s}")
for pname, pw in PRIORS.items():
    for eps in EPS:
        res = {k: ([], []) for k in FIT_NAMES}; nl = []
        for s in range(SEEDS):
            d = simulate(wd, H, np.random.default_rng(1000 + s))
            fits, nlab = run_logged(wd, d, np.random.default_rng(s), eps=eps, prior_w=pw, hours=(H,))
            nl.append(nlab[H])
            for k in FIT_NAMES:
                w = fits[H][k]
                res[k][0].append(run_fixed(wd, held[s], w).sum() / 100)
                res[k][1].append(np.linalg.norm(w - wo))
        for k in FIT_NAMES:
            log(f"{pname:11s} {eps:6.3f} {k:>15s} {ms(res[k][0]):>15s} {ms(res[k][1]):>16s} {np.mean(nl):9.0f}")
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
