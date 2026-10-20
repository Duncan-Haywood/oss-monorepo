"""IPS vs unweighted refit, exploration rate, and drift. Writes experiments/results.txt."""
import time
from dataclasses import replace

import numpy as np

from ambient_ips.ips import (INFORMED_W, PRIOR_W, WINDOWS_PER_HOUR, World, oracle_weights,
                             run_fixed, run_online, simulate)

SEEDS = 20
H = 100
EPS = [0.002, 0.005, 0.02]
PRIORS = {"uninformed": PRIOR_W, "informed": INFORMED_W}
out = []


def log(s=""):
    print(s); out.append(s)


def ms(x):
    return f"{np.mean(x):7.2f} +- {np.std(x):5.2f}"


def rate(u, a, b):
    return u[int(a * WINDOWS_PER_HOUR):int(b * WINDOWS_PER_HOUR)].sum() / (b - a)


t0 = time.time()
wd = World()
wo = oracle_weights(wd, np.random.default_rng(12345), 2000)
held = [simulate(wd, 100, np.random.default_rng(5000 + s)) for s in range(SEEDS)]
oracle_held = np.mean([run_fixed(wd, h, wo).sum() / 100 for h in held])
log(f"world: prevalence {wd.prevalence}, d'={wd.d_prime}, benefit {wd.benefit}, false cost 1 (x{wd.others_cost} if others talk)")
log(f"oracle weights [score, keyword, others, intercept] = {np.round(wo, 3).tolist()}; oracle utility/h on held-out streams {oracle_held:.2f}")
log(f"{SEEDS} seeds, {H} h streams, refit every 10 min; '+-' is the std over seeds")

log("\n== 1. Online utility per hour (hours 20-100, includes the cost of exploring) and dismissals per hour")
log("== 2. Learned-model quality: utility per hour of the model snapshot at hour 20 / 100 applied WITHOUT exploration to held-out streams")
log(f"{'prior':11s} {'eps':>6s} {'weighting':>9s} {'online h20-100':>16s} {'dismiss/h':>9s} {'model@20h':>16s} {'model@100h':>16s}")
for pname, pw in PRIORS.items():
    for eps in EPS:
        for wt in ["none", "ips"]:
            on, dis, m20, m100 = [], [], [], []
            for s in range(SEEDS):
                d = simulate(wd, H, np.random.default_rng(1000 + s))
                u, dm, _, snap = run_online(wd, d, np.random.default_rng(s), eps=eps, weighting=wt, prior_w=pw)
                on.append(rate(u, 20, 100)); dis.append(dm[20 * WINDOWS_PER_HOUR:].sum() / 80)
                m20.append(run_fixed(wd, held[s], snap[20]).sum() / 100)
                m100.append(run_fixed(wd, held[s], snap[100]).sum() / 100)
            log(f"{pname:11s} {eps:6.3f} {wt:>9s} {ms(on):>16s} {np.mean(dis):9.1f} {ms(m20):>16s} {ms(m100):>16s}")

log("\n== 3. Drift: at hour 50 d' falls 2.0 -> 1.0 (informed prior, eps 0.005). Utility per hour, hours 50-100")
wd2 = replace(wd, d_prime=1.0)
wo2 = oracle_weights(wd2, np.random.default_rng(54321), 2000)
rows = {k: [] for k in ["stale offline weights", "post-drift oracle"]}
variants = [("none", None), ("ips", None), ("none", 20), ("ips", 20)]
for wt, fh in variants:
    rows[f"online {wt}, forget {fh}"] = []
for s in range(SEEDS):
    d1 = simulate(wd, 50, np.random.default_rng(2000 + s)); d2 = simulate(wd2, 50, np.random.default_rng(3000 + s))
    d = {k: np.concatenate([d1[k], d2[k]]) for k in d1}
    rows["stale offline weights"].append(rate(run_fixed(wd, d, wo), 50, 100))
    rows["post-drift oracle"].append(rate(run_fixed(wd, d, wo2), 50, 100))
    for wt, fh in variants:
        u = run_online(wd, d, np.random.default_rng(s), eps=0.005, weighting=wt, prior_w=INFORMED_W, forget_hours=fh)[0]
        rows[f"online {wt}, forget {fh}"].append(rate(u, 50, 100))
for k, v in rows.items():
    log(f"{k:30s} {ms(v)}")
log(f"\nruntime {time.time() - t0:.0f} s")
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
