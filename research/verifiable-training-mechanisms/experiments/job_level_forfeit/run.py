"""Milestone 83: what do large stall sets really cost? Exact harms of the sets a worker stalls in its best responses
(H1/H4 link; data for the job-level forfeiture analysis in analyze.py)

Milestone 82 measured the harm of stalling one s = 20 segment at each of N = 75 positions and checked additivity on
five-segment sets only (set harm / sum of single harms 1.03 to 1.04). Its game B then priced best responses that stall
25, 50 or all 75 segments by adding single harms. This run measures those sets exactly. Per schedule (cosine, constant,
wsd, as milestone 82) and test seed 0-39, the held-out loss after stalling:
  all           every segment (the weights never leave their initialisation)
  top m, bot m  the m segments with the highest / lowest pooled milestone-82 harm, m = 10, 25, 50
  rand m        m segments drawn at random per seed, m = 10, 25, 50
  uni-5 (x2)    all but 5 segments drawn at random: the additive-fine worker's response to uniform k = 5 coverage
                below its deterrence point, with the 5 opened (caught) segments repaired
  knap B/g      milestone 82's knapsack response at k = 5, B/g = 5 and 10: every segment covered below theta, and the
                same set without its one partially covered segment (the zero-coverage set Z)
A stalled run restarts from the honest checkpoint at the first stalled segment.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; a few minutes on 4 processes). Writes results.json."""
import importlib.util
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
HWS = os.path.join(HERE, "..", "harm_weighted_sampling")


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m82 = _load("m82_run", os.path.join(HWS, "run.py"))
m82a = _load("m82_analyze", os.path.join(HWS, "analyze.py"))
from vtm.margin import init, loss  # noqa: E402  (m82_run puts src on the path via milestone 80's run.py)

T, S, N = m82.T, m82.S, m82.N
SEEDS = list(range(40))
MS = (10, 25, 50)
K = 5
SUMMARY = json.load(open(os.path.join(HWS, "summary.json")))


def fixed_sets(sched):
    """Sets that depend only on the pooled milestone-82 harm profile of this schedule."""
    h = np.array(SUMMARY[sched]["harm"])
    order = np.argsort(-h, kind="stable")
    sets = {"all": list(range(N))}
    for m in MS:
        sets[f"top{m}"] = sorted(int(j) for j in order[:m])
        sets[f"bot{m}"] = sorted(int(j) for j in order[-m:])
    d = np.ones(N)  # milestone 82: d_j = 1 at every position on every schedule
    for bg in (5, 10):
        th = 1.0 / bg
        c = m82a.knapsack(h, d, K, th)
        stall = sorted(int(j) for j in np.flatnonzero(c < th - 1e-12))
        sets[f"knap{bg}"] = stall
        sets[f"knapZ{bg}"] = sorted(int(j) for j in np.flatnonzero(c == 0))
        part = [int(j) for j in np.flatnonzero((c > 0) & (c < th - 1e-12))]
        sets[f"knap{bg}_partial"] = {"seg": part, "c": [float(c[j]) for j in part]}
    return sets


def job(args):
    seed, sched = args
    lrs, batches = m82.lr_sched(sched), m82.batches_for(seed)
    xte, yte = m82.DATA[2], m82.DATA[3]
    w0 = init(np.random.default_rng(seed))
    ws = m82.train(w0, 0, lrs, batches)
    base = float(loss(ws[-1], xte, yte))
    sets = {k: v for k, v in fixed_sets(sched).items() if not k.endswith("_partial")}
    rng = np.random.default_rng(70_000 + seed)
    for m in MS:
        sets[f"rand{m}"] = sorted(int(j) for j in rng.choice(N, m, replace=False))
    for r in range(2):
        opened = set(int(j) for j in rng.choice(N, K, replace=False))
        sets[f"uni-5_{r}"] = sorted(set(range(N)) - opened)
    out = {}
    for name, segs in sets.items():
        if len(segs) == N:
            lo = float(loss(w0, xte, yte))
        else:
            t0 = segs[0] * S
            rest = m82.train(ws[t0], t0, lrs, batches, skip=frozenset(segs))
            lo = float(loss(rest[-1], xte, yte))
        out[name] = {"segs": segs, "loss": m82.g7(lo)}
    return seed, sched, base, out


def main():
    from multiprocessing import Pool
    procs = int(os.environ.get("PROCS", 4))
    with Pool(procs) as pool:
        res = pool.map(job, [(sd, sc) for sc in m82.SCHEDULES for sd in SEEDS])
    R = {"T": T, "S": S, "N": N, "K": K, "schedules": {}}
    for sc in m82.SCHEDULES:
        R["schedules"][sc] = {
            "partial": {k: v for k, v in fixed_sets(sc).items() if k.endswith("_partial")},
            "test": {str(sd): {"honest": base, "sets": out} for sd, s2, base, out in res if s2 == sc}}
    json.dump(R, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(res), "jobs")


if __name__ == "__main__":
    main()
