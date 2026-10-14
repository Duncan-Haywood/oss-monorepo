"""Cap chosen by validation vs fixed caps vs hindsight-best cap. Writes experiments/results.txt."""
import numpy as np

from ambient_capcv.core import FIT_NAMES, GRID, INFORMED_W, PRIOR_W, World, oracle_weights, run_fixed, run_logged, simulate

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
for pname, pw in PRIORS.items():
    for eps in EPS:
        res = {k: [] for k in FIT_NAMES}; caps = []
        for s in range(SEEDS):
            d = simulate(wd, H, np.random.default_rng(1000 + s))
            fits, nlab, chosen = run_logged(wd, d, np.random.default_rng(s), eps=eps, prior_w=pw, hours=(H,),
                                            held=[held[s]], w_scorer=scorer)
            caps.append(chosen[H])
            for k in FIT_NAMES:
                res[k].append(scorer(fits[H][k], held[s]))
        for k in FIT_NAMES:
            log(f"{pname:11s} {eps:6.3f} {k:>15s} {ms(res[k]):>15s}")
        log(f"{pname:11s} {eps:6.3f} {'cv-chosen caps':>15s} " + ", ".join(f"{c}:{caps.count(c)}" for c in GRID if caps.count(c)))
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
