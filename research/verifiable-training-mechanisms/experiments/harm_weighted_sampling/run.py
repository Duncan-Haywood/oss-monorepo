"""Milestone 82: how much harm does one cheated segment do, by position, and under which learning-rate schedule?
(H1/H4 link; data for the harm-weighted sampling game in analyze.py)

Milestone 81 found that any shrink large enough to matter is flagged on every segment it touches, so detection is set
by which segments the referee opens, and that the same cheat placed late cost nothing measurable under a cosine
schedule. This run measures the harm of a one-segment full stall (the worker skips all s = 20 steps of segment j and
commits its start weights as its end weights) at every one of the N = 75 segment positions, under three schedules
with the same summed learning rate (150, as cosine with lr0 = 0.2 over T = 1,500 steps):
  cosine    milestone 80's schedule, lr0 = 0.2
  constant  0.1 throughout (no decaying tail)
  wsd       warmup-stable-decay without the warmup: 0.1111 to step 1,200, then linear to 0 (a 20% cooldown)
Per test seed (0-39) and schedule: the honest final held-out loss, the loss after stalling each segment j, and, on the
stalled segment, the fp16 referee's and the float32 reorder arbiter's drift / mean replayed step (milestone 80's
statistics, replayed from the worker's checkpoint). Also four random 5-segment stall sets per seed, to test whether
harms add. Honest calibration per schedule (seeds 100-109): the same two statistics on all 75 segments.

Same MLP, data, batches and replay code as milestone 80 (imported). A stall leaves the weights unchanged, so each
stalled run restarts from the honest checkpoint at the segment's start and trains on from step t0 + s.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; about 4 minutes on 4 processes). Writes results.json."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m80_run", os.path.join(HERE, "..", "dispute_arbiter", "run.py"))
m80 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m80)  # milestone 80's run.py, loaded under its own name (this file is also run.py)
from vtm.margin import grad, init, loss  # noqa: E402

T, S, N, BATCH = m80.T, m80.S, m80.N, m80.BATCH
TEST_SEEDS, CAL_SEEDS = list(range(40)), list(range(100, 110))
SETS_PER_SEED, SET_SIZE = 4, 5


def lr_sched(name):
    t = np.arange(T)
    if name == "cosine":
        return 0.2 * 0.5 * (1 + np.cos(np.pi * t / T))
    if name == "constant":
        return np.full(T, 0.1)
    if name == "wsd":
        a = 150.0 / 1350.0
        return np.where(t < 1200, a, a * (T - t) / 300.0)
    raise ValueError(name)


SCHEDULES = ("cosine", "constant", "wsd")
DATA = m80.DATA


def batches_for(seed):
    orng = np.random.default_rng(10_000 + seed)
    return [orng.integers(0, len(DATA[1]), BATCH) for _ in range(T)]


def train(w, t_from, lrs, batches, skip=frozenset()):
    xtr, ytr = DATA[0], DATA[1]
    ws = [w]
    for t in range(t_from, T):
        if t // S not in skip:
            w = w - lrs[t] * grad(w, xtr[batches[t]], ytr[batches[t]])
        ws.append(w)
    return ws


def seg_ratio(mode, w0, w_end, t0, lrs, batches, rng):
    xtr, ytr = DATA[0], DATA[1]
    wr = w0.astype(np.float64) if mode == "f64" else w0
    norms = []
    for t in range(t0, t0 + S):
        b = batches[t]
        nxt = m80.replay_step(mode, wr, xtr[b], ytr[b], float(lrs[t]), rng)
        norms.append(float(np.linalg.norm(nxt - wr)))
        wr = nxt
    return float(np.linalg.norm(w_end.astype(np.float64) - wr) / np.mean(norms))


def g7(v):
    return float(f"{v:.6g}")


def test_job(args):
    seed, sched = args
    lrs, batches = lr_sched(sched), batches_for(seed)
    xte, yte = DATA[2], DATA[3]
    ws = train(init(np.random.default_rng(seed)), 0, lrs, batches)
    base = float(loss(ws[-1], xte, yte))
    prng = np.random.default_rng(30_000 + seed)
    single = []
    for j in range(N):
        t0 = j * S
        rest = train(ws[t0], t0 + S, lrs, batches)  # stall: weights at t0 + S equal weights at t0
        single.append({"loss": g7(loss(rest[-1], xte, yte)),
                       "fp16": g7(seg_ratio("fp16", ws[t0], ws[t0], t0, lrs, batches, prng)),
                       "reorder": g7(seg_ratio("reorder", ws[t0], ws[t0], t0, lrs, batches, prng))})
    srng = np.random.default_rng(50_000 + seed)
    sets = []
    for _ in range(SETS_PER_SEED):
        segs = sorted(int(v) for v in srng.choice(N, SET_SIZE, replace=False))
        t0 = segs[0] * S
        rest = train(ws[t0], t0, lrs, batches, skip=frozenset(segs))
        sets.append({"segs": segs, "loss": g7(loss(rest[-1], xte, yte))})
    return seed, sched, base, single, sets


def cal_job(args):
    seed, sched = args
    lrs, batches = lr_sched(sched), batches_for(seed)
    ws = train(init(np.random.default_rng(seed)), 0, lrs, batches)
    prng = np.random.default_rng(30_000 + seed)
    out = {"fp16": [], "reorder": []}
    for j in range(N):
        t0 = j * S
        for mode in out:
            out[mode].append(g7(seg_ratio(mode, ws[t0], ws[t0 + S], t0, lrs, batches, prng)))
    return seed, sched, out


def main():
    from multiprocessing import Pool
    procs = int(os.environ.get("PROCS", 4))
    with Pool(procs) as pool:
        tests = pool.map(test_job, [(sd, sc) for sc in SCHEDULES for sd in TEST_SEEDS])
        cals = pool.map(cal_job, [(sd, sc) for sc in SCHEDULES for sd in CAL_SEEDS])
    res = {"T": T, "S": S, "N": N, "schedules": {}}
    for sc in SCHEDULES:
        res["schedules"][sc] = {
            "lr": [g7(v) for v in lr_sched(sc)[::S]],
            "test": {str(sd): {"honest": base, "single": single, "sets": sets}
                     for sd, s2, base, single, sets in tests if s2 == sc},
            "cal": {str(sd): o for sd, s2, o in cals if s2 == sc}}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(tests), "test jobs,", len(cals), "calibration jobs")


if __name__ == "__main__":
    main()
