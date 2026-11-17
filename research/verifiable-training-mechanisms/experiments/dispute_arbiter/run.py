"""Milestone 80: the dispute step. Can an arbiter that replays one flagged segment at the worker's precision clear an
honest worker and convict a cheat, and what does the whole two-stage protocol cost? (H1/H4 link)

Milestone 79 priced a dispute as C replayed steps and found the protocol worth it at C = T but not at C = 10 T. That
assumed a dispute had to redo the job. This run builds the arbiter: given a segment the fp16 referee flagged, it
replays only that segment (s steps, from the worker's committed checkpoint, same batches) at float32 or float64, in
its own arithmetic order, and compares with the worker's committed end-of-segment weights.

Worker: float32 SGD in its own (canonical) order, as in milestones 3 and 75 to 79. Per s = 20 segment we store drift
||w_worker(t0+s) - w_replay(t0+s)|| and the mean replayed step norm for four replays:
  fp16     the referee of milestones 75-79 (weights and inputs rounded to float16)
  reorder  float32, batch rows permuted each step: a different reduction order on the same kind of hardware
  shard4   float32, gradient = mean of four 16-row shard gradients: a different device count
  f64      float64 throughout: higher precision than the worker
Calibration: 40 honest seeds (100-139). Test: 20 seeds (0-19) under an honest worker and a ladder of uniform shrinks
(eta = 2e-2 down to 1e-7) plus milestone 77's tail cheat. Analysis is in analyze.py.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; a few minutes on 4 processes). Writes results.json."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import grad, init, load_digits_split, loss, lr_at, unpack  # noqa: E402

TEST_SEEDS, CAL_SEEDS = list(range(20)), list(range(100, 140))
T, BATCH, LR0, S = 1500, 64, 0.2, 20
N = T // S
TAIL0 = 1200
CHEATS = {
    "honest": (0, 0, 0.0),
    "uniform 2e-2": (0, T, 2e-2),
    "uniform 5e-3": (0, T, 5e-3),
    "uniform 1e-3": (0, T, 1e-3),
    "uniform 3e-4": (0, T, 3e-4),
    "uniform 1e-4": (0, T, 1e-4),
    "uniform 3e-5": (0, T, 3e-5),
    "uniform 1e-5": (0, T, 1e-5),
    "uniform 3e-6": (0, T, 3e-6),
    "uniform 1e-6": (0, T, 1e-6),
    "uniform 1e-7": (0, T, 1e-7),
    "tail 300 x 0.1": (TAIL0, T, 0.1),
}
MODES = ("fp16", "reorder", "shard4", "f64")
DATA = load_digits_split()


def grad64(w, x, y):
    """Same gradient as vtm.margin.grad, in float64 with no final rounding."""
    w, x = w.astype(np.float64), x.astype(np.float64)
    w1, b1, w2, b2 = unpack(w)
    z = x @ w1 + b1
    h = np.maximum(z, 0)
    o = h @ w2 + b2
    o = o - o.max(1, keepdims=True)
    p = np.exp(o)
    p /= p.sum(1, keepdims=True)
    p[np.arange(len(y)), y] -= 1
    p /= len(y)
    dh = (p @ w2.T) * (z > 0)
    return np.concatenate([(x.T @ dh).ravel(), dh.sum(0), (h.T @ p).ravel(), p.sum(0)])


def replay_step(mode, w, x, y, lr, rng):
    if mode == "fp16":
        return w - lr * grad(w, x, y, low_precision=True)
    if mode == "reorder":
        perm = rng.permutation(len(y))
        return w - np.float32(lr) * grad(w, x[perm], y[perm])
    if mode == "shard4":
        g = sum(grad(w, x[i::4], y[i::4]) for i in range(4)) / np.float32(4)
        return w - np.float32(lr) * g
    if mode == "f64":
        return w - lr * grad64(w, x, y)
    raise ValueError(mode)


def run_one(seed, eta):
    xtr, ytr, xte, yte = DATA
    w = init(np.random.default_rng(seed))
    orng = np.random.default_rng(10_000 + seed)
    batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
    ws = [w]
    for t in range(T):
        w = w - (1 - eta[t]) * lr_at(t, T, LR0) * grad(w, xtr[batches[t]], ytr[batches[t]])
        ws.append(w)
    prng = np.random.default_rng(30_000 + seed)  # the arbiter's own order stream
    g7 = lambda v: float(f"{v:.6g}")
    seg = []
    for j in range(N):
        t0, rec = j * S, {}
        for mode in MODES:
            wr = ws[t0].astype(np.float64) if mode == "f64" else ws[t0]
            norms = []
            for t in range(t0, t0 + S):
                b = batches[t]
                nxt = replay_step(mode, wr, xtr[b], ytr[b], lr_at(t, T, LR0), prng)
                norms.append(float(np.linalg.norm(nxt - wr)))
                wr = nxt
            rec[mode] = [g7(np.linalg.norm(ws[t0 + S].astype(np.float64) - wr)), g7(np.mean(norms))]
        seg.append(rec)
    return seg, float(loss(ws[-1], xte, yte))


def job(args):
    seed, name = args
    lo, hi, e = CHEATS[name]
    eta = np.zeros(T)
    eta[lo:hi] = e
    seg, l = run_one(seed, eta)
    return seed, name, seg, l


def main():
    from multiprocessing import Pool
    tasks = [(sd, "honest") for sd in CAL_SEEDS] + [(sd, n) for sd in TEST_SEEDS for n in CHEATS]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        out = pool.map(job, tasks)
    cal = {sd: seg for sd, n, seg, l in out if sd in CAL_SEEDS}
    test = {}
    for sd, n, seg, l in out:
        if sd in TEST_SEEDS:
            test.setdefault(n, {})[str(sd)] = {"seg": seg, "loss": l}
    json.dump({"T": T, "S": S, "LR0": LR0, "TAIL0": TAIL0, "modes": list(MODES),
               "cheats": {k: list(v) for k, v in CHEATS.items()},
               "cal": {str(k): v for k, v in sorted(cal.items())}, "test": test},
              open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(cal), "calibration seeds,", len(test), "test configs")


if __name__ == "__main__":
    main()
