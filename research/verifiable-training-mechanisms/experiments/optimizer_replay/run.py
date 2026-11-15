"""Milestone 86: does the replay referee still convict a stalled segment under momentum SGD and Adam? (H1/H4 link;
data for analyze.py)

Milestones 82 and 84 measured detection d_j = 1 for every stalled segment under plain SGD (the fp16 referee flags it,
the float32 reorder arbiter convicts it). Milestone 85 then priced the saboteur's game under momentum and Adam with
d = 1 *assumed*, because that replay was SGD-only. Under momentum or Adam the committed state is (weights, moments),
and the replay must carry the moments: the referee restarts from the committed start state of segment j, runs its
s = 20 steps with its own arithmetic, and compares the result with the committed end state.

Optimisers (milestone 85's definitions, imported): sgd (plain, schedule sum 150), momentum (EMA heavy ball 0.9, sum
150), adam15 (Adam 0.9/0.999/1e-8, sum 1.5, mean lr 1e-3, the rate at which milestone 85's harm profile was
measurable) and adam60 (sum 6.0, milestone 85's chosen rate). Bias correction counts the global step.
Schedules: cosine, step, warmcos, sgdr (milestone 84). Seeds: calibration 100-139, test 0-39 (milestone 82's batches).

The replay from the committed start state does not depend on what the worker committed at the end, so one honest run
per seed with every intermediate state stored gives every cheat at once:
  honest       committed end = honest state at t0 + 20
  skip q       the worker runs the first 20 - q steps of the segment honestly and commits that state (weights and
               moments) as the end of the segment; q = 20 is milestone 85's full stall; q = 1, 2, 5, 10 measure how
               few skipped steps the replay resolves.
Replay modes: fp16 (the referee: gradients from weights and inputs rounded to float16; optimiser arithmetic in
float32) and reorder (the arbiter: float32, batch rows permuted each step). Statistics per segment and mode:
  wratio = ||w_committed - w_replay|| / mean replayed weight-step norm   (milestones 80-84's statistic)
  mratio = ||m_committed - m_replay|| / ||m_replay||                    (first moment; momentum and Adam only)
Run: OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (numpy + scikit-learn; a few minutes on 4 processes).
Writes results.json.
Diagnostic (after the run, LOG.md): SGD_F64=1 OPTS=sgd OUT=results_sgd_f64.json, same command (plain SGD with float64
weights, as milestones 80-84's workers ran through numpy's type promotion)."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
_spec = importlib.util.spec_from_file_location("m85_run", os.path.join(HERE, "..", "optimizer_harm_model", "run.py"))
m85 = importlib.util.module_from_spec(_spec)
sys.modules["m85_run"] = m85
_spec.loader.exec_module(m85)
m82 = m85.m82
from vtm.margin import grad, init  # noqa: E402

T, S, N = m85.T, m85.S, m85.N
DATA = m85.DATA
OPTS = {"sgd": ("sgd", 150.0), "momentum": ("momentum", 150.0), "adam15": ("adam", 1.5), "adam60": ("adam", 6.0)}
SCHEDULES = m85.TEST_SCHEDULES
SKIPS = (1, 2, 5, 10, 20)
TEST_SEEDS, CAL_SEEDS = tuple(range(40)), tuple(range(100, 140))
MODES = ("fp16", "reorder")
SGD_F64 = bool(os.environ.get("SGD_F64"))


def zero_state(kind, w):
    return () if kind == "sgd" else m85.zero_state(kind, w)


def opt_step(kind, w, st, g, lr, t):
    if kind == "sgd":
        if SGD_F64:  # diagnostic: milestones 80-84's worker, whose float64 lr promoted the weights to float64
            return w.astype(np.float64) - lr * g, ()
        return (w - np.float32(lr) * g).astype(np.float32), ()
    w2, st2, _ = m85.step(kind, w, st, g, lr, t)
    return w2.astype(np.float32), st2


def mode_grad(mode, w, x, y, rng):
    if mode == "fp16":
        return grad(w, x, y, low_precision=True)
    if mode == "reorder":
        p = rng.permutation(len(y))
        return grad(w, x[p], y[p])
    if mode == "worker":
        return grad(w, x, y)
    raise ValueError(mode)


def g7(v):
    return float(f"{v:.6g}")


def job(args):
    name, sched, seed = args
    kind, total = OPTS[name]
    lrs = m85.schedule(sched, total)
    batches = m82.batches_for(seed)
    xtr, ytr = DATA[0], DATA[1]
    w = init(np.random.default_rng(seed))
    st = zero_state(kind, w)
    states = [(w, st)]
    for t in range(T):
        b = batches[t]
        w, st = opt_step(kind, w, st, mode_grad("worker", w, xtr[b], ytr[b], None), float(lrs[t]), t)
        states.append((w, st))
    rng = np.random.default_rng(70_000 + seed)
    out = {m: {"w": {"honest": []} | {f"skip{q}": [] for q in SKIPS},
               "m": {"honest": []} | {f"skip{q}": [] for q in SKIPS}} for m in MODES}
    for j in range(N):
        t0 = j * S
        for mode in MODES:
            wr, sr = states[t0]
            norms = []
            for t in range(t0, t0 + S):
                b = batches[t]
                nw, sr = opt_step(kind, wr, sr, mode_grad(mode, wr, xtr[b], ytr[b], rng), float(lrs[t]), t)
                norms.append(float(np.linalg.norm(nw.astype(np.float64) - wr)))
                wr = nw
            scale = float(np.mean(norms))
            mref = sr[0].astype(np.float64) if sr else None
            for key, idx in [("honest", t0 + S)] + [(f"skip{q}", t0 + S - q) for q in SKIPS]:
                wc, sc = states[idx]
                out[mode]["w"][key].append(g7(np.linalg.norm(wc.astype(np.float64) - wr) / scale))
                if sr:
                    out[mode]["m"][key].append(g7(np.linalg.norm(sc[0].astype(np.float64) - mref)
                                                  / np.linalg.norm(mref)))
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
