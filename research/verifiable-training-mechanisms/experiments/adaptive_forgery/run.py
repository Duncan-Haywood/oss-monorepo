"""Milestone 87: do zero-gradient forgeries of the committed moments beat the weight-or-moment referee? (H1/H4 link;
data for analyze.py)

Milestone 86 found that under momentum and Adam the fp16 replay referee misses a worker who skips one or two of a
segment's 20 steps when it checks the committed weights alone, and that checking the committed first moment as well
catches one skipped step in 79% to 100% of segments. Its skip cheat was naive: the worker stopped early and committed
the truncated state. A worker who knows the referee checks weights and moments can forge the missing steps without
computing their gradients, so the committed state moves as if the steps had been taken. Two such forgeries, each
costing no gradient evaluation for the q skipped steps:
  stale q   the worker re-applies the last gradient it computed (step t0 + 20 - q - 1) for each of the last q steps,
            through the optimiser, with the schedule's learning rate and step index;
  coast q   the worker uses its current first moment as the gradient for each of the last q steps (momentum and
            Adam only): m is unchanged, Adam's v absorbs m*m, and the weights move along the momentum direction.
The naive skip q of milestone 86 is rerun as the control. q = 1, 2, 5, 10.

Optimisers, schedules, seeds, batches, model and replay modes are milestone 86's (imported unchanged). Statistics per
segment and replay mode: wratio (weights, over the mean replayed step), mratio (first moment, relative) and vratio
(Adam's second moment, relative). Thresholds and decision rules are in LOG.md, fixed before the run.
Run: OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (numpy + scikit-learn; 4 processes). Writes results.json."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
_spec = importlib.util.spec_from_file_location("m86_run", os.path.join(HERE, "..", "optimizer_replay", "run.py"))
m86 = importlib.util.module_from_spec(_spec)
sys.modules["m86_run"] = m86
_spec.loader.exec_module(m86)
m85, m82 = m86.m85, m86.m82

T, S, N = m86.T, m86.S, m86.N
DATA = m86.DATA
OPTS = m86.OPTS
SCHEDULES = m86.SCHEDULES
SKIPS = (1, 2, 5, 10)
TEST_SEEDS, CAL_SEEDS = m86.TEST_SEEDS, m86.CAL_SEEDS
MODES = m86.MODES
STATS = ("w", "m", "v")


def forged(kind, how, states, batches, lrs, t0, q):
    """End state of segment t0 committed by a worker who computed only its first S - q steps and forged the rest."""
    t1 = t0 + S - q
    w, st = states[t1]
    if how == "skip":
        return w, st
    if how == "stale":
        wp, _ = states[t1 - 1]
        b = batches[t1 - 1]
        g = m86.mode_grad("worker", wp, DATA[0][b], DATA[1][b], None)
    for t in range(t1, t0 + S):
        if how == "coast":
            g = st[0]
        w, st = m86.opt_step(kind, w, st, g, float(lrs[t]), t)
    return w, st


def cheats(kind):
    return ["skip", "stale"] + ([] if kind == "sgd" else ["coast"])


def g7(v):
    return float(f"{v:.6g}")


def rel(a, ref):
    ref = ref.astype(np.float64)
    return np.linalg.norm(a.astype(np.float64) - ref) / np.linalg.norm(ref)


def job(args):
    name, sched, seed = args
    kind, total = OPTS[name]
    lrs = m85.schedule(sched, total)
    batches = m82.batches_for(seed)
    xtr, ytr = DATA[0], DATA[1]
    w = m86.init(np.random.default_rng(seed))
    st = m86.zero_state(kind, w)
    states = [(w, st)]
    for t in range(T):
        b = batches[t]
        w, st = m86.opt_step(kind, w, st, m86.mode_grad("worker", w, xtr[b], ytr[b], None), float(lrs[t]), t)
        states.append((w, st))
    keys = ["honest"] + [f"{c}{q}" for c in cheats(kind) for q in SKIPS]
    stats = ("w",) if kind == "sgd" else ("w", "m") if kind == "momentum" else STATS
    cands = {}
    for j in range(N):
        t0 = j * S
        cands[j] = {"honest": states[t0 + S]}
        for c in cheats(kind):
            for q in SKIPS:
                cands[j][f"{c}{q}"] = forged(kind, c, states, batches, lrs, t0, q)
    rng = np.random.default_rng(70_000 + seed)  # milestone 86's arbiter permutation stream
    out = {m: {s: {k: [] for k in keys} for s in stats} for m in MODES}
    for j in range(N):
        t0 = j * S
        for mode in MODES:
            wr, sr = states[t0]
            norms = []
            for t in range(t0, t0 + S):
                b = batches[t]
                nw, sr = m86.opt_step(kind, wr, sr, m86.mode_grad(mode, wr, xtr[b], ytr[b], rng), float(lrs[t]), t)
                norms.append(float(np.linalg.norm(nw.astype(np.float64) - wr)))
                wr = nw
            scale = float(np.mean(norms))
            for k in keys:
                wc, sc = cands[j][k]
                out[mode]["w"][k].append(g7(np.linalg.norm(wc.astype(np.float64) - wr) / scale))
                if "m" in stats:
                    out[mode]["m"][k].append(g7(rel(sc[0], sr[0])))
                if "v" in stats:
                    out[mode]["v"][k].append(g7(rel(sc[1], sr[1])))
    return name, sched, seed, out


def main():
    from multiprocessing import Pool
    seeds = TEST_SEEDS + CAL_SEEDS
    opts = tuple(os.environ.get("OPTS", ",".join(OPTS)).split(","))
    if os.environ.get("SEEDS"):
        seeds = tuple(int(v) for v in os.environ["SEEDS"].split(","))
    jobs = [(o, sc, sd) for o in opts for sc in SCHEDULES for sd in seeds]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        res_list = pool.map(job, jobs, chunksize=1)
    res = {"T": T, "S": S, "N": N, "skips": list(SKIPS), "opts": {k: list(v) for k, v in OPTS.items()},
           "test_seeds": list(TEST_SEEDS), "cal_seeds": list(CAL_SEEDS), "runs": {}}
    for name, sched, seed, out in res_list:
        res["runs"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = out
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
