"""Milestone 76: spread or concentrate? Where should a shrinking worker put its budget against sampled segment replay?

Milestone 75 found a uniform shrink of 2% to 5% of every step hides inside the fp16 drift tolerance. Here the
worker has a fixed budget E = sum_t eta_t (in step units) and either spreads it (eta = E/T everywhere) or
concentrates it in a window of W steps (eta = E/W there, 0 elsewhere), placed early, mid or late in training.

Segments are the commitment grid of milestone 74 (non-overlapping, length s, starts 0, s, 2s, ...). The referee
replays a segment in fp16 from the worker's checkpoint and flags it when the L2 distance to the worker's next
checkpoint exceeds rho_s x the replayed mean step norm. rho_s is calibrated here on 40 fresh honest seeds
(100..139), the maximum over every grid segment, which is the fix milestone 75 named for its 0.2% false flags.
The verifier samples k segments uniformly without replacement at replay budget B = k s; a job is caught when a
flagged segment is sampled: P = 1 - C(N - m, k) / C(N, k) for m flagged of N segments, averaged over seeds.
Harm: paired held-out loss change of the final weights against the same seed's honest run.

Run: OMP_NUM_THREADS=1 python3 run.py   (about ten minutes on 4 cores). Writes results.json, results.txt."""
import json, os, sys
from math import comb
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import bootstrap_ci, grad, init, load_digits_split, loss, lr_at  # noqa: E402

T, BATCH, LR0 = 1500, 64, 0.2
TEST_SEEDS = list(range(20))
CAL_SEEDS = list(range(100, 140))
SS = [5, 20]
BUDGETS = [20, 100, 300]          # replay budget B in steps; k = B / s segments sampled
E = 75.0                          # shrink budget in step units = uniform eta 0.05 (milestone 75's largest hidden level)
CONFIGS = [  # name, window start, window length W, eta in window
    ("honest", 0, T, 0.0),
    ("uniform 0.02 (E=30)", 0, T, 0.02),
    ("uniform 0.05", 0, T, E / T),
    ("W=750 eta=0.1 late", 750, 750, E / 750),
    ("W=300 eta=0.25 early", 0, 300, E / 300),
    ("W=300 eta=0.25 mid", 600, 300, E / 300),
    ("W=300 eta=0.25 late", 1200, 300, E / 300),
    ("W=75 stall early", 0, 75, 1.0),
    ("W=75 stall mid", 600, 75, 1.0),
    ("W=75 stall late", 1425, 75, 1.0),
]
DATA = load_digits_split()


def eta_at(cfg, t):
    _, a, w, e = cfg
    return e if a <= t < a + w else 0.0


def trajectory(seed, cfg):
    xtr, ytr, _, _ = DATA
    rng = np.random.default_rng(seed)
    w = init(rng)
    orng = np.random.default_rng(10_000 + seed)
    batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
    ws = [w]
    for t in range(T):
        w = w - (1 - eta_at(cfg, t)) * lr_at(t, T, LR0) * grad(w, xtr[batches[t]], ytr[batches[t]])
        ws.append(w)
    return ws, batches


def ratios(ws, batches, s):
    """Per grid segment: ||w_sub(t0+s) - replay|| / mean replayed step norm."""
    xtr, ytr, _, _ = DATA
    out = []
    for t0 in range(0, T, s):
        wr, norms = ws[t0], []
        for t in range(t0, t0 + s):
            d = -lr_at(t, T, LR0) * grad(wr, xtr[batches[t]], ytr[batches[t]], low_precision=True)
            norms.append(float(np.linalg.norm(d)))
            wr = wr + d
        out.append(float(np.linalg.norm(ws[t0 + s] - wr)) / float(np.mean(norms)))
    return out


def calibrate(seed):
    ws, b = trajectory(seed, CONFIGS[0])
    return {s: ratios(ws, b, s) for s in SS}


def run_test(seed):
    _, _, xte, yte = DATA
    out = {}
    for cfg in CONFIGS:
        ws, b = trajectory(seed, cfg)
        out[cfg[0]] = {"loss": loss(ws[-1], xte, yte), "ratio": {s: ratios(ws, b, s) for s in SS}}
    return seed, out


def p_catch(m, n, k):
    return 1.0 - comb(n - m, k) / comb(n, k)


def main():
    from multiprocessing import Pool
    with Pool(4) as p:
        cal = p.map(calibrate, CAL_SEEDS)
        res = dict(p.map(run_test, TEST_SEEDS))
    rho = {s: max(max(c[s]) for c in cal) for s in SS}
    r4 = lambda v: [round(x, 4) for x in v]
    json.dump({"rho": rho, "cal_p99": {s: float(np.quantile(sum((c[s] for c in cal), []), 0.99)) for s in SS},
               "res": {str(k): {c: {"loss": v[c]["loss"], "ratio": {s: r4(v[c]["ratio"][s]) for s in SS}} for c in v}
                       for k, v in res.items()}},
              open(os.path.join(HERE, "results.json"), "w"))
    L = [f"rho_s calibrated on {len(CAL_SEEDS)} honest seeds x every grid segment (max): "
         + ", ".join(f"s={s}: {rho[s]:.4f} (n={len(CAL_SEEDS) * T // s})" for s in SS),
         f"{len(TEST_SEEDS)} test seeds, T = {T}. flag = share of grid segments flagged; in-win = share flagged among "
         "segments overlapping the window. P(B) = mean chance a job is caught at replay budget B (k = B/s sampled).",
         "dL = paired held-out loss change vs honest, mean [95% bootstrap CI]."]
    base = [res[sd]["honest"]["loss"] for sd in TEST_SEEDS]
    for s in SS:
        n = T // s
        L.append(f"\ns = {s} ({n} segments)")
        L.append(f"  {'config':<22} {'dL [95% CI]':<29} {'flag':>6} {'in-win':>7} " + " ".join(f"{'P(B=' + str(B) + ')':>9}" for B in BUDGETS))
        for cfg in CONFIGS:
            name, a, W, _ = cfg
            d = np.array([res[sd][name]["loss"] - base[sd] for sd in TEST_SEEDS])
            lo, hi = bootstrap_ci(d) if name != "honest" else (0.0, 0.0)
            fl = [np.array(res[sd][name]["ratio"][s]) > rho[s] for sd in TEST_SEEDS]
            inw = [i for i in range(n) if i * s < a + W and i * s + s > a]
            pc = {B: np.mean([p_catch(int(f.sum()), n, B // s) for f in fl]) for B in BUDGETS}
            L.append(f"  {name:<22} {d.mean():+.4f} [{lo:+.4f}, {hi:+.4f}]   {np.mean([f.mean() for f in fl]):6.3f} "
                     f"{np.mean([f[inw].mean() for f in fl]):7.3f} " + " ".join(f"{pc[B]:9.3f}" for B in BUDGETS))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
