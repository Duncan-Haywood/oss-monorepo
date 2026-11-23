"""Milestone 92: does committing the Kahan compensation buffer of plain-SGD weights close the float32 arbiter's last
blind zone? (H1/H4 link; data for analyze.py)

Milestone 91's quantile-thresholded float32 reorder arbiter convicts one forged float16 step in every segment of every
momentum and Adam cell, but under plain SGD its worst zone (the schedule's last, where the learning rate is smallest)
is convicted in only 0.22 to 0.36 of segments. Diagnosis written before this run (LOG.md): SGD commits only the
float32 weights, and when lr x |g| falls towards one unit in the last place of |w|, the update's rounding into float32
weights is a discrepancy floor that honest reorder noise hits as often as a forged float16 gradient does. Momentum and
Adam escape because their buffers are compared too and carry the gradient without that floor.

The candidate fix is a practitioner's tool: Kahan-compensated SGD (the weight update keeps its rounding error in a
compensation buffer c, as in compensated low-precision optimisers), with c committed alongside w. The arbiter compares
w - c, the compensated weights, which no longer carry the float32 rounding floor. Each job trains one seed twice:
  plain  milestone 89's SGD worker, statistic w (milestone 91's, control)
  kahan  Kahan-compensated SGD worker, statistics w (weights only) and wc (||(w - c)_commit - (w - c)_replay|| / scale)
with milestone 89's cheats (skip q, f16 q, bf16 q, sub b q) re-run on each worker's own trajectory and the float32
reorder arbiter only (milestone 86's permutation stream).

Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; 4 processes). Writes results.json (gitignored size:
run it to reproduce; analyze.py writes results.txt and summary.json). Decision rules are in LOG.md, fixed before."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m89_run", os.path.join(HERE, "..", "precision_forgery", "run.py"))
m89 = importlib.util.module_from_spec(_spec)
sys.modules["m89_run"] = m89
_spec.loader.exec_module(m89)
m88, m86, m85, m82 = m89.m88, m89.m86, m89.m85, m89.m82

T, S, N, DATA = m89.T, m89.S, m89.N, m89.DATA
QS, PRECS, SUB_BS, SUB_QS = m89.QS, m89.PRECS, m89.SUB_BS, m89.SUB_QS
SCHEDULES = m89.SCHEDULES
CAL_SEEDS = tuple(range(100, 180))   # milestone 91's C80
HOLD_SEEDS = tuple(range(300, 340))  # milestone 91's holdout (control)
FRESH_SEEDS = tuple(range(400, 440))  # never run before: the claim
g7 = m89.g7
KINDS = ("plain", "kahan")


def kahan_step(w, c, g, lr):
    """One Kahan-compensated SGD step in float32: w - c tracks the exactly summed updates."""
    y = (np.float32(-lr) * g - c).astype(np.float32)
    t = (w + y).astype(np.float32)
    c2 = ((t - w) - y).astype(np.float32)
    return t, c2


def step(kind, w, c, g, lr, t):
    if kind == "plain":
        return m86.opt_step("sgd", w, (), g, lr, t)[0], c
    return kahan_step(w, c, g, lr)


def gfun(spec, w, x, y, rng):
    if spec == "worker":
        return m86.mode_grad("worker", w, x, y, None)
    if spec == "reorder":
        return m86.mode_grad("reorder", w, x, y, rng)
    return m89.prec_grad(spec, w, x, y)


def forged(kind, states, batches, lrs, t0, q, spec, rows=None):
    t1 = t0 + S - q
    w, c = states[t1]
    for t in range(t1, t0 + S):
        b = batches[t] if rows is None else batches[t][:rows]
        w, c = step(kind, w, c, gfun(spec, w, DATA[0][b], DATA[1][b], None), float(lrs[t]), t)
    return w, c


def comp(w, c):
    return w.astype(np.float64) - c.astype(np.float64)


def job(args):
    sched, seed = args
    _, total = m89.OPTS["sgd"]
    lrs = m85.schedule(sched, total)
    batches = m82.batches_for(seed)
    xtr, ytr = DATA[0], DATA[1]
    ks = m89.keys()
    out, losses = {}, {}
    for kind in KINDS:
        w = m86.init(np.random.default_rng(seed))
        c = np.zeros_like(w)
        states = [(w, c)]
        for t in range(T):
            bt = batches[t]
            w, c = step(kind, w, c, gfun("worker", w, xtr[bt], ytr[bt], None), float(lrs[t]), t)
            states.append((w, c))
        losses[kind] = g7(float(m89.loss(w, DATA[2], DATA[3])))
        rng = np.random.default_rng(70_000 + seed)  # milestone 86's arbiter permutation stream
        stats = ("w",) if kind == "plain" else ("w", "wc")
        o = {s: {k: [] for k in ks} for s in stats}
        for j in range(N):
            t0 = j * S
            cands = {"honest": states[t0 + S]}
            for q in QS:
                cands[f"skip{q}"] = states[t0 + S - q]
                for p in PRECS:
                    cands[f"{p}_{q}"] = forged(kind, states, batches, lrs, t0, q, p)
            for q in SUB_QS:
                for b in SUB_BS:
                    cands[f"sub{b}_{q}"] = forged(kind, states, batches, lrs, t0, q, "worker", rows=b)
            wr, cr = states[t0]
            norms = []
            for t in range(t0, t0 + S):
                bt = batches[t]
                nw, cr = step(kind, wr, cr, gfun("reorder", wr, xtr[bt], ytr[bt], rng), float(lrs[t]), t)
                norms.append(float(np.linalg.norm(nw.astype(np.float64) - wr)))
                wr = nw
            scale = float(np.mean(norms))
            ref = comp(wr, cr)
            for k in ks:
                wk, ck = cands[k]
                o["w"][k].append(g7(np.linalg.norm(wk.astype(np.float64) - wr) / scale))
                if "wc" in o:
                    o["wc"][k].append(g7(np.linalg.norm(comp(wk, ck) - ref) / scale))
        out[kind] = o
    return sched, seed, out, losses


def main():
    from multiprocessing import Pool
    seeds = CAL_SEEDS + HOLD_SEEDS + FRESH_SEEDS
    if os.environ.get("SEEDS"):
        seeds = tuple(int(v) for v in os.environ["SEEDS"].split(","))
    scheds = tuple(os.environ.get("SCHEDS", ",".join(SCHEDULES)).split(","))
    jobs = [(sc, sd) for sc in scheds for sd in seeds]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        res_list = pool.map(job, jobs, chunksize=1)
    res = {"T": T, "S": S, "N": N, "qs": list(QS), "cal_seeds": list(CAL_SEEDS), "hold_seeds": list(HOLD_SEEDS),
           "fresh_seeds": list(FRESH_SEEDS), "runs": {}, "losses": {}}
    for sched, seed, out, losses in res_list:
        res["runs"].setdefault(sched, {})[str(seed)] = out
        res["losses"].setdefault(sched, {})[str(seed)] = losses
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
