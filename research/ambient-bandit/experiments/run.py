"""Online interruption-policy learning from accept/dismiss feedback. Writes results.txt."""
import sys
import time
from dataclasses import replace

import numpy as np

from ambient_bandit.bandit import (PRIOR_W, WINDOWS_PER_HOUR, World, oracle_weights, run_fixed,
                                   run_online, simulate)

SEEDS = 20
H = 100
MODES = ["greedy", "eps", "thompson"]
PRIORS = {"uninformed": PRIOR_W, "informed": np.array([1.0, 0.0, 0.0, -3.5])}
out = []


def log(s=""):
    print(s); out.append(s)


def rate(u, a, b):  # utility per hour between hours a and b
    return u[int(a * WINDOWS_PER_HOUR):int(b * WINDOWS_PER_HOUR)].sum() / (b - a)


def ms(x):
    return f"{np.mean(x):8.2f} +- {np.std(x):6.2f}"


t0 = time.time()
wd = World()
wo = oracle_weights(wd, np.random.default_rng(12345), 2000)
log(f"world: prevalence {wd.prevalence}, d'={wd.d_prime}, benefit {wd.benefit}, false cost 1 (x{wd.others_cost} if others talk)")
log(f"offline oracle weights [score, keyword, others, intercept] = {np.round(wo, 3).tolist()} (fitted on 2000 labelled hours)")
log(f"{SEEDS} seeds, {H} h streams, refit every 10 min, labels only from windows where it spoke")

# ---- experiment 1 and 2: stationary world
log("\n== 1. Utility per hour in hour windows, and total dismissals (stationary world)")
res = {}
for pname, pw in PRIORS.items():
    for mode in MODES:
        rows = []
        for s in range(SEEDS):
            d = simulate(wd, H, np.random.default_rng(1000 + s))
            u, dis, sp = run_online(wd, d, mode, np.random.default_rng(s), prior_w=pw)
            uo = run_fixed(wd, d, wo)
            wake_u = None
            rows.append(dict(u=u, uo=uo, dis=dis))
        res[(pname, mode)] = rows
log(f"{'prior':11s} {'policy':9s} {'h0-5':>16s} {'h5-20':>16s} {'h20-100':>16s} {'dismiss/h 20-100':>18s}   (oracle h20-100)")
for (pname, mode), rows in res.items():
    a = [rate(r['u'], 0, 5) for r in rows]; b = [rate(r['u'], 5, 20) for r in rows]; c = [rate(r['u'], 20, 100) for r in rows]
    dd = [r['dis'][20 * WINDOWS_PER_HOUR:].sum() / 80 for r in rows]
    oc = [rate(r['uo'], 20, 100) for r in rows]
    log(f"{pname:11s} {mode:9s} {ms(a)} {ms(b)} {ms(c)} {np.mean(dd):10.1f}            {np.mean(oc):.2f}")

log("\n== 2. Cumulative regret vs offline oracle (utility units) and dismissals spent")
log(f"{'prior':11s} {'policy':9s} {'regret@5h':>14s} {'regret@20h':>14s} {'regret@100h':>14s} {'dismissals@20h':>15s}")
for (pname, mode), rows in res.items():
    def reg(h):
        k = int(h * WINDOWS_PER_HOUR)
        return [r['uo'][:k].sum() - r['u'][:k].sum() for r in rows]
    dis20 = [r['dis'][:20 * WINDOWS_PER_HOUR].sum() for r in rows]
    log(f"{pname:11s} {mode:9s} {np.mean(reg(5)):14.1f} {np.mean(reg(20)):14.1f} {np.mean(reg(100)):14.1f} {np.mean(dis20):15.1f}")

log("\n== 3. Hours until the trailing 10 h utility rate first reaches 90% of the oracle's (median over seeds; 'never' = share of seeds that did not within 100 h)")
for (pname, mode), rows in res.items():
    hits = []
    for r in rows:
        cu = np.cumsum(r['u']); co = np.cumsum(r['uo']); k = 10 * WINDOWS_PER_HOUR
        hit = np.nan
        for t in range(k, len(cu), WINDOWS_PER_HOUR):
            if (cu[t] - cu[t - k]) >= 0.9 * (co[t] - co[t - k]):
                hit = t / WINDOWS_PER_HOUR; break
        hits.append(hit)
    hits = np.array(hits)
    log(f"{pname:11s} {mode:9s} median {np.nanmedian(hits) if (~np.isnan(hits)).any() else float('nan'):6.1f} h; never: {np.mean(np.isnan(hits)):.0%}")

# ---- experiment 4: drift
log("\n== 4. Drift: at hour 50 the intent classifier degrades (d' 2.0 -> 1.0). Utility per hour, hours 50-100")
wd2 = replace(wd, d_prime=1.0)
wo2 = oracle_weights(wd2, np.random.default_rng(54321), 2000)
rows = {k: [] for k in ["stale offline (pre-drift weights)", "post-drift oracle", "bandit, no forgetting", "bandit, forget>20 h"]}
for s in range(SEEDS):
    d1 = simulate(wd, 50, np.random.default_rng(2000 + s)); d2 = simulate(wd2, 50, np.random.default_rng(3000 + s))
    d = {k: np.concatenate([d1[k], d2[k]]) for k in d1}
    rows["stale offline (pre-drift weights)"].append(rate(run_fixed(wd, d, wo), 50, 100))
    rows["post-drift oracle"].append(rate(run_fixed(wd, d, wo2), 50, 100))
    for name, fh in [("bandit, no forgetting", None), ("bandit, forget>20 h", 20)]:
        # the world seen by the policy's decision rule is unchanged: only the data drifts
        u, _, _ = run_online(wd, d, "greedy", np.random.default_rng(s), prior_w=PRIORS["informed"], forget_hours=fh)
        rows[name].append(rate(u, 50, 100))
for k, v in rows.items():
    log(f"{k:36s} {ms(v)}")
log(f"\nruntime {time.time() - t0:.0f} s")
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
