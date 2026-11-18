"""Milestone 6b: a robot policy learned inside each crowd twin, then evaluated in the other twins.

Predictions L1 to L6 are in LOG.md, written before this script's full run.

Milestone 6a found that the three families that pass the held-out share test (social force,
collision-free speed, ORCA) rank the four hand-written policies identically by robot-person close
passes, and not by human delay. Milestone 6 also asks for a learned policy trained against each
family on an equal budget. This step does the cheapest honest version of that, and it is **not
SARL**: SARL (Chen et al. 2019) is a deep value network over a velocity action space, trained by
imitation then temporal-difference learning, and needs a neural-network library this container
does not have. Here the robot stays an agent of the crowd's own model (as in 5a to 6a) and what is
learned is its steering target: `robots.LearnedLateral`, a five-parameter policy whose target
offset is 0.9 tanh(theta . [1, m_same, m_opp, f_opp, u]). Its family contains "crowd", "opposite"
and a smooth "adapt", so training can recover any of them or find something between.

Training (per family, equal budget): the cross-entropy method (Rubinstein 1999; de Boer et al.
2005), 10 iterations x 12 candidates, elite 3, starting at mean = crowd's theta, sd 1.0 per
parameter, sd floor 0.05. Each candidate is scored on both HERMES 3.6 m runs x 3 seeds at 10%
robots, with common random numbers inside an iteration (all 12 candidates see the same seeds; the
seeds change between iterations). 720 training runs per family. The objective, fixed before the
run, is the human cost

    J = close-pass rate (pass-weighted over runs and seeds) + LAMBDA * human delay per transit (s)

with LAMBDA = 0.05 per s (one second of delay per human transit counts as five points of
close-pass rate). In training no 0% baseline is run: within an iteration all candidates share
seeds, so subtracting a baseline would not change their order, and mean human transit is used.

Evaluation (fresh seeds, SEED_EVAL = 20290000, 20 per cell): the four hand policies and the three
learned policies (each family's final CEM mean) in each of the three families, both runs, 10%
robots, plus the 0% crowd for the delay baseline. 960 runs. Reported per family: J, close-pass
rate and delay per transit, with percentile bootstrap intervals over seeds (B = 1000); the
transfer matrix (learned-in-A evaluated in B); Kendall tau of the seven-policy ranking by J and by
close passes between each pair of families.

Writes m6b_learned_results.txt, m6b_learned_eval.csv and m6b_learned_train.csv.

Needs jupedsim, numpy and numba: PY=$(python3 platform/ci/pyenv.py jupedsim numpy numba), then
  "$PY" experiments/m6b_learned.py   (about 30 min on 4 cores; cached in data_cache/m6b_*.json)
M6B_SMOKE=1 runs a tiny version (2 iterations x 4 candidates, 2 eval seeds, 50 s; separate cache).
"""
from __future__ import annotations

import csv
import itertools
import json
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import m5_robots as M5  # noqa: E402
import robots as R  # noqa: E402

SMOKE = os.environ.get("M6B_SMOKE") == "1"
FITTED = {"sf": 0.1, "cfsm": 0.2, "orca": 1.0}   # milestones 3, 4b, 4d
FAMS = list(FITTED)
NAMES = {"sf": "social force", "cfsm": "collision-free speed", "orca": "ORCA"}
RUNS = [("bo-360-090-090", 0.9, {"sf": 30, "cfsm": 20, "orca": 30}),
        ("bo-360-160-160", 1.6, {"sf": 60, "cfsm": 60, "orca": 60})]
SHARE, SPEED = 0.10, M5.SPEED
LAMBDA = 0.05
ITERS, POP, ELITE = (2, 4, 2) if SMOKE else (10, 12, 3)
TRAIN_SEEDS = 1 if SMOKE else 3
SD0, SD_FLOOR = 1.0, 0.05
SEED_TRAIN, SEED_EVAL = 20280000, 20290000
EVAL_SEEDS = 2 if SMOKE else 20
DURATION = 50.0 if SMOKE else M5.DURATION
HAND = list(M5.POLICIES)
B = 1000
TAG = "m6b_smoke" if SMOKE else "m6b"


def _sim(job):
    k, fam, ent, n, nr, pol, seed = job
    if isinstance(pol, list):
        pol = R.LearnedLateral(pol)
    kw = dict(duration=DURATION, warmup=M5.WARMUP, robots=nr, policy=pol if nr else "crowd",
              robot_speed=SPEED, passes=True)
    if fam == "orca":
        import orca as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, FITTED[fam], seed, **kw)
    else:
        import sftwin as mod
        r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, FITTED[fam], seed, model=fam, **kw)
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np.floating, np.integer)) else b) for a, b in r.items()}


def pool_runs(rs, base_tr=None):
    """Pass-weighted close rate, mean human transit (or delay vs base), J, over a list of results."""
    ok = [r for r in rs if not r["failed"]]
    ps = sum(r.get("rp_passes", 0) for r in ok)
    close = sum(r["rp_close"] * r["rp_passes"] for r in ok if r.get("rp_passes")) / ps if ps else float("nan")
    tr = [(r["transit"] - (base_tr[r["_run"]] if base_tr else 0.0)) for r in ok if r["transit"] == r["transit"]]
    tr = float(np.mean(tr)) if tr else float("nan")
    return dict(close=close, delay=tr, J=close + LAMBDA * tr, passes=ps, ok=len(ok))


def run_jobs(pool, jobs, cache, cpath):
    todo = [j for j in jobs if j[0] not in cache]
    todo.sort(key=lambda j: (j[1] != "orca", -j[3]))
    for k, r in pool.imap_unordered(_sim, todo, chunksize=1):
        cache[k] = r
    json.dump(cache, open(cpath, "w"))


def train(pool, fam, cache, cpath, log):
    rng = np.random.default_rng(SEED_TRAIN + FAMS.index(fam))
    mu = R.LearnedLateral.crowd().theta.copy()
    sd = np.full(R.LearnedLateral.N_PARAMS, SD0)
    for it in range(ITERS):
        cand = [mu.copy()] + [mu + sd * rng.standard_normal(len(mu)) for _ in range(POP - 1)]
        jobs, idx = [], []
        for c, th in enumerate(cand):
            for run, ent, ns in RUNS:
                n = ns[fam]
                for s in range(TRAIN_SEEDS):
                    seed = SEED_TRAIN + 100 * it + s
                    k = "|".join(map(str, ("train", fam, it, c, run, s, DURATION)))
                    jobs.append((k, fam, ent, n, M5.n_robots(n, SHARE), [float(x) for x in th], seed))
                    idx.append((c, run, k))
        run_jobs(pool, jobs, cache, cpath)
        scores = []
        for c in range(POP):
            rs = [dict(cache[k], _run=run) for cc, run, k in idx if cc == c]
            scores.append(pool_runs(rs))
        order = np.argsort([s["J"] if s["J"] == s["J"] else 9e9 for s in scores])
        elite = np.array([cand[i] for i in order[:ELITE]])
        for c in range(POP):
            log.append(dict(family=fam, iteration=it, candidate=c, elite=int(c in order[:ELITE]),
                            J=scores[c]["J"], close=scores[c]["close"], transit=scores[c]["delay"],
                            **{f"theta{j}": float(cand[c][j]) for j in range(len(mu))}))
        mu = elite.mean(axis=0)
        sd = np.maximum(elite.std(axis=0), SD_FLOOR)
        print(f"  {fam} it {it}: best J {scores[order[0]]['J']:.4f}  mean-candidate J {scores[0]['J']:.4f}"
              f"  mu {np.round(mu, 2).tolist()}", flush=True)
    return mu


def kendall(a, b):
    n, s = len(a), 0
    for i, j in itertools.combinations(range(n), 2):
        s += np.sign(a[i] - a[j]) * np.sign(b[i] - b[j])
    return s / (n * (n - 1) / 2)


def main():
    os.makedirs(M5.CACHE, exist_ok=True)
    cpath = os.path.join(M5.CACHE, f"{TAG}_cache.json")
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    log = []
    thetas = {}
    with mp.Pool(int(os.environ.get("M5_PROCS", "4"))) as pool:
        for fam in FAMS:
            thetas[fam] = train(pool, fam, cache, cpath, log)
        pols = {p: p for p in HAND} | {f"learned-{f}": [float(x) for x in thetas[f]] for f in FAMS}
        jobs = []
        for fam in FAMS:
            for run, ent, ns in RUNS:
                n = ns[fam]
                for name, pol in [("none", "crowd")] + list(pols.items()):
                    nr = 0 if name == "none" else M5.n_robots(n, SHARE)
                    for s in range(EVAL_SEEDS):
                        k = "|".join(map(str, ("eval", fam, run, name, s, DURATION)))
                        jobs.append((k, fam, ent, n, nr, pol, SEED_EVAL + s))
        print(f"evaluation: {len(jobs)} runs", flush=True)
        run_jobs(pool, jobs, cache, cpath)

    def ev(fam, run, name):
        return [dict(cache["|".join(map(str, ("eval", fam, run, name, s, DURATION)))], _run=run)
                for s in range(EVAL_SEEDS)]

    rng = np.random.default_rng(6)
    out, rows = [], []
    out.append("Milestone 6b: a lateral-target policy learned in each crowd twin (CEM), evaluated in all three")
    out.append(f"share {SHARE:.0%}, robots {SPEED} m/s, J = close-pass rate + {LAMBDA} x delay per transit (s); "
               f"{ITERS} iterations x {POP} candidates x {2 * TRAIN_SEEDS} runs per family; "
               f"{EVAL_SEEDS} fresh seeds per eval cell, {DURATION:.0f} s runs")
    out.append("")
    out.append("Trained theta (bias, m_same, m_opp, f_opp, u) and target offset alone in its lane:")
    for f in FAMS:
        th = thetas[f]
        alone = R.LearnedLateral.OFFSET_MAX * np.tanh(th @ np.array([1, 0.5, 0, 0, 0.5]))
        out.append(f"  learned-{f:5s} {np.round(th, 3).tolist()}  offset {alone:+.3f} (crowd lane +0.500)")
    out.append("")
    table = {}
    for fam in FAMS:
        base = {run: float(np.mean([r["transit"] for r in ev(fam, run, "none") if not r["failed"]]))
                for run, _, _ in RUNS}
        out.append(f"{NAMES[fam]} (beta {FITTED[fam]}): policy, J [95%], close-pass rate [95%], delay s [95%]")
        for name in pols:
            per_run = [ev(fam, run, name) for run, _, _ in RUNS]
            st = pool_runs(per_run[0] + per_run[1], base)
            bs = []
            for _ in range(B):
                pick = [[rs[i] for i in rng.integers(0, len(rs), len(rs))] for rs in per_run]
                bs.append(pool_runs(pick[0] + pick[1], base))
            ci = {m: np.nanpercentile([b[m] for b in bs], [2.5, 97.5]) for m in ("J", "close", "delay")}
            table[(fam, name)] = st
            rows.append(dict(family=fam, policy=name, J=st["J"], J_lo=ci["J"][0], J_hi=ci["J"][1],
                             close=st["close"], close_lo=ci["close"][0], close_hi=ci["close"][1],
                             delay=st["delay"], delay_lo=ci["delay"][0], delay_hi=ci["delay"][1],
                             passes=st["passes"]))
            out.append(f"  {name:14s} {st['J']:.4f} [{ci['J'][0]:.4f}, {ci['J'][1]:.4f}]  "
                       f"{st['close']:.3f} [{ci['close'][0]:.3f}, {ci['close'][1]:.3f}]  "
                       f"{st['delay']:+.3f} [{ci['delay'][0]:+.3f}, {ci['delay'][1]:+.3f}]")
        out.append("")
    out.append("Transfer matrix, J of the policy learned in row family evaluated in column family (lower is better):")
    out.append("               " + "".join(f"{f:>10s}" for f in FAMS) + "     crowd row: " + " ".join(
        f"{table[(f, 'crowd')]['J']:.4f}" for f in FAMS))
    for a in FAMS:
        out.append(f"  learned-{a:5s}" + "".join(f"{table[(b, f'learned-{a}')]['J']:10.4f}" for b in FAMS))
    out.append("")
    names = list(pols)
    for m in ("J", "close", "delay"):
        taus = []
        for a, b in itertools.combinations(FAMS, 2):
            t = kendall([table[(a, p)][m] for p in names], [table[(b, p)][m] for p in names])
            taus.append(f"{a}-{b} {t:+.2f}")
        out.append(f"Kendall tau-a of the seven-policy ranking by {m}: " + ", ".join(taus))
    txt = "\n".join(out)
    print(txt)
    open(os.path.join(HERE, f"{TAG}_learned_results.txt"), "w").write(txt + "\n")
    with open(os.path.join(HERE, f"{TAG}_learned_eval.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(HERE, f"{TAG}_learned_train.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(log[0]))
        w.writeheader()
        w.writerows(log)


if __name__ == "__main__":
    main()
