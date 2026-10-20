"""Explore-only fits, offline on the deployed history (A) and as the online learner (B). Writes experiments/results.txt."""
import numpy as np

from ambient_exploreonly.core import (FIT_NAMES, INFORMED_W, PRIOR_W, WINDOWS_PER_HOUR, World, oracle_weights,
                                      run_fixed, run_logged, run_online, simulate)

SEEDS = 20
H = 100
EPS = [0.002, 0.005, 0.02, 0.05]
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

log("\nA. Offline: fits on the history of the deployed (biased-refit) learner")
log(f"{'prior':11s} {'eps':>6s} {'fit':>15s} {'utility/h':>15s} {'dist to oracle':>16s} {'intercept':>16s}  labels")
for pname, pw in PRIORS.items():
    for eps in EPS:
        res = {k: ([], [], []) for k in FIT_NAMES}; nsp, nex = [], []
        for s in range(SEEDS):
            d = simulate(wd, H, np.random.default_rng(1000 + s))
            fits, cnt = run_logged(wd, d, np.random.default_rng(s), eps=eps, prior_w=pw, hours=(H,))
            nsp.append(cnt[H]["spoke"]); nex.append(cnt[H]["explored"])
            for k in FIT_NAMES:
                w = fits[H][k]
                res[k][0].append(run_fixed(wd, held[s], w).sum() / H)
                res[k][1].append(np.linalg.norm(w - wo))
                res[k][2].append(w[3])
        for k in FIT_NAMES:
            lab = {"biased": np.mean(nsp), "random_matched": np.mean(nsp), "explore_only": np.mean(nex),
                   "explore_matched": np.mean(nex), "full": H * WINDOWS_PER_HOUR}[k]
            log(f"{pname:11s} {eps:6.3f} {k:>15s} {ms(res[k][0]):>15s} {ms(res[k][1]):>16s} {ms(res[k][2]):>16s}  {lab:6.0f}")

log("\nB. Online: the learner refits on 'biased' (all spoken windows) or 'explore_only' (coin-only windows)")
log("utility/h and dismissals/h over hours 20-100 of one 100 h stream; 'final' = final weights scored with no exploration on held-out streams")
log(f"{'prior':11s} {'eps':>6s} {'learner':>13s} {'online u/h':>15s} {'dismiss/h':>15s} {'final u/h':>15s}")
for pname, pw in PRIORS.items():
    for eps in EPS:
        for learner in ("biased", "explore_only"):
            on, dm, fin = [], [], []
            for s in range(SEEDS):
                d = simulate(wd, H, np.random.default_rng(1000 + s))
                u, dis, wf = run_online(wd, d, np.random.default_rng(s), eps=eps, learner=learner, prior_w=pw)
                a = 20 * WINDOWS_PER_HOUR
                on.append(u[a:].sum() / (H - 20)); dm.append(dis[a:].sum() / (H - 20))
                fin.append(run_fixed(wd, held[s], wf).sum() / H)
            log(f"{pname:11s} {eps:6.3f} {learner:>13s} {ms(on):>15s} {ms(dm):>15s} {ms(fin):>15s}")
open("experiments/results.txt", "w").write("\n".join(out) + "\n")
