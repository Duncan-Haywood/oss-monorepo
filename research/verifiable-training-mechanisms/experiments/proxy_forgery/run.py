"""Milestone 88: how much compute can a sub-batch proxy forger save before the weight-or-moment referee catches it?
(H1/H4 link; data for analyze.py)

Milestone 87 found that zero-gradient forgeries of a segment's last q steps (stale, coast) are caught by a referee
that checks the committed weights and moments. A forger who spends part of a gradient does better: for each of the
last q of a segment's 20 steps it takes the gradient of only the first b of the step's 64 rows (a uniform sub-sample,
since rows are drawn i.i.d.) and pushes that proxy through the optimiser. b = 64 is the honest step (code check).
Saved compute of a segment = q (64 - b) / (64 x 20). The naive skip q of milestones 86 and 87 is rerun as control.

Everything else is milestone 87's (imported unchanged): optimisers, schedules, seeds, batches, model, replay modes
(fp16 referee, float32 reorder arbiter with milestone 86's permutation stream) and statistics w, m, v.
Thresholds and decision rules are in LOG.md, fixed before the run.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; about 15 minutes on 4 processes). Writes results.json
(gitignored size: run it to reproduce; analyze.py writes results.txt and summary.json)."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m87_run", os.path.join(HERE, "..", "adaptive_forgery", "run.py"))
m87 = importlib.util.module_from_spec(_spec)
sys.modules["m87_run"] = m87
_spec.loader.exec_module(m87)
m86, m85, m82 = m87.m86, m87.m85, m87.m82

T, S, N = m87.T, m87.S, m87.N
DATA = m87.DATA
OPTS = m87.OPTS
SCHEDULES = m87.SCHEDULES
TEST_SEEDS, CAL_SEEDS = m87.TEST_SEEDS, m87.CAL_SEEDS
MODES = m87.MODES
QS = (1, 2, 5)
BS = (1, 8, 16, 32, 48, 56, 60, 62, 63, 64)
BATCH = 64
g7, rel = m87.g7, m87.rel


def sub_forged(kind, states, batches, lrs, t0, q, b):
    """End state when the last q steps of segment t0 use the gradient of the first b rows of each step's batch."""
    t1 = t0 + S - q
    w, st = states[t1]
    for t in range(t1, t0 + S):
        rows = batches[t][:b]
        g = m86.mode_grad("worker", w, DATA[0][rows], DATA[1][rows], None)
        w, st = m86.opt_step(kind, w, st, g, float(lrs[t]), t)
    return w, st


def keys():
    return ["honest"] + [f"skip{q}" for q in QS] + [f"sub{b}_{q}" for q in QS for b in BS]


def job(args):
    name, sched, seed = args
    kind, total = OPTS[name]
    lrs = m85.schedule(sched, total)
    batches = m82.batches_for(seed)
    assert all(len(bt) == BATCH for bt in batches)
    xtr, ytr = DATA[0], DATA[1]
    w = m86.init(np.random.default_rng(seed))
    st = m86.zero_state(kind, w)
    states = [(w, st)]
    for t in range(T):
        bt = batches[t]
        w, st = m86.opt_step(kind, w, st, m86.mode_grad("worker", w, xtr[bt], ytr[bt], None), float(lrs[t]), t)
        states.append((w, st))
    ks = keys()
    stats = ("w",) if kind == "sgd" else ("w", "m") if kind == "momentum" else ("w", "m", "v")
    rng = np.random.default_rng(70_000 + seed)  # milestone 86's arbiter permutation stream, same draw order
    out = {m: {s: {k: [] for k in ks} for s in stats} for m in MODES}
    for j in range(N):
        t0 = j * S
        cands = {"honest": states[t0 + S]}
        for q in QS:
            cands[f"skip{q}"] = states[t0 + S - q]
            for b in BS:
                cands[f"sub{b}_{q}"] = sub_forged(kind, states, batches, lrs, t0, q, b)
        for mode in MODES:
            wr, sr = states[t0]
            norms = []
            for t in range(t0, t0 + S):
                bt = batches[t]
                nw, sr = m86.opt_step(kind, wr, sr, m86.mode_grad(mode, wr, xtr[bt], ytr[bt], rng), float(lrs[t]), t)
                norms.append(float(np.linalg.norm(nw.astype(np.float64) - wr)))
                wr = nw
            scale = float(np.mean(norms))
            for k in ks:
                wc, sc = cands[k]
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
    res = {"T": T, "S": S, "N": N, "qs": list(QS), "bs": list(BS), "batch": BATCH,
           "opts": {k: list(v) for k, v in OPTS.items()},
           "test_seeds": list(TEST_SEEDS), "cal_seeds": list(CAL_SEEDS), "runs": {}}
    for name, sched, seed, out in res_list:
        res["runs"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = out
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
