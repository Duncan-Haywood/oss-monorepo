"""Ablation of the cap selector: score (IPS/DR) x folds (4/8) x fold type (contiguous/random), vs fixed caps and hindsight-best cap. Writes experiments/results.txt."""
from multiprocessing import Pool

import numpy as np

from ambient_drablate.core import FIT_NAMES, GRID, SELECTORS, INFORMED_W, PRIOR_W, World, oracle_weights, run_fixed, run_logged, simulate

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
scorer = lambda w, h: run_fixed(wd, h, w).sum() / 100
oracle_held = np.mean([scorer(wo, h) for h in held])
log(f"oracle weights = {np.round(wo, 3).tolist()}; oracle utility/h on held-out {oracle_held:.2f}")
log(f"{SEEDS} seeds, fits at hour {H}; scored on fresh 100 h held-out streams, no exploration; '+-' is std over seeds")
log("hindsight = best cap in the grid by held-out utility (not available to a real assistant)")
log(f"{'prior':11s} {'eps':>6s} {'fit':>15s} {'utility/h':>15s}")


def cell(job):
    pname, eps = job
    pw = PRIORS[pname]; lines = []
    res = {k: [] for k in FIT_NAMES}; caps = {k: [] for k in SELECTORS}
    for s in range(SEEDS):
        d = simulate(wd, H, np.random.default_rng(1000 + s))
        fits, nlab, chosen = run_logged(wd, d, np.random.default_rng(s), eps=eps, prior_w=pw, hours=(H,),
                                        held=[held[s]], w_scorer=scorer)
        for k in caps:
            caps[k].append(chosen[H][k])
        for k in FIT_NAMES:
            res[k].append(scorer(fits[H][k], held[s]))
    for k in FIT_NAMES:
        lines.append(f"{pname:11s} {eps:6.3f} {k:>15s} {ms(res[k]):>15s}")
    for k, cl in caps.items():
        lines.append(f"{pname:11s} {eps:6.3f} {k + ' caps':>15s} " + ", ".join(f"{c}:{cl.count(c)}" for c in GRID if cl.count(c)))
    return lines


if __name__ == "__main__":
    jobs = [(p, e) for p in PRIORS for e in EPS]
    with Pool(4) as pool:
        for lines in pool.map(cell, jobs, chunksize=1):
            for l in lines:
                log(l)
    open("experiments/results.txt", "w").write("\n".join(out) + "\n")
