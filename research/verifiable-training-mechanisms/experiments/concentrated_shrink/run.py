"""Milestone 76: does concentrating a shrink budget into a window beat secret segment sampling? (H1/H4 link)

The worker withholds E = 30 step-equivalents of training (sum over steps of eta_t, the fraction of the honest step it
drops; E = 0.02 x T is milestone 75's largest hidden uniform shrink). It spreads E uniformly (W = T, eta = 0.02) or packs
it into a window of W steps with eta = E / W (W = 300, 100, 30 -> eta = 0.1, 0.3, 1.0, the last a full stall), placed
early (starting at step 0) or late (ending at step T).

The referee tiles training into N = T / s segments of s = 20 steps, replays each from the worker's own checkpoint in fp16
on the same batches, and flags a segment when ||w_sub(t0+s) - w_replay|| > rho * mean replayed step norm. rho is set
from separate honest calibration seeds (the maximum over all their segments), fixing milestone 75's plan error of
reusing milestone 72's smaller sample. A verifier opens k segments chosen uniformly and secretly after submission; the
job is caught if any opened segment is flagged: P = 1 - C(N - q, k) / C(N, k), q = flagged segments of that job.
Harm: paired held-out loss change against the same seed's honest run.
Run: OMP_NUM_THREADS=1 PYTHONPATH=../../src python3 run.py   (a few minutes, 4 processes). Writes results.json/.txt."""
import json, os, sys
from math import comb
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from vtm.margin import bootstrap_ci, grad, init, load_digits_split, loss, lr_at  # noqa: E402

TEST_SEEDS, CAL_SEEDS = list(range(20)), list(range(100, 120))
T, BATCH, LR0, S, E = 1500, 64, 0.2, 20, 30.0
N = T // S
WINDOWS = [T, 300, 100, 30]
PLACES = ["early", "late"]
KS = [1, 5, 10, 20]
DATA = load_digits_split()


def configs():
    out = [("honest", 0, "none")]
    for W in WINDOWS:
        for p in (PLACES if W < T else ["all"]):
            out.append((f"W={W} {p}", W, p))
    return out


def eta_schedule(W, place):
    eta = np.zeros(T)
    if W == 0:
        return eta
    lo = 0 if place in ("early", "all") else T - W
    eta[lo:lo + W] = E / W
    return eta


def run_one(seed, eta):
    """Returns the per-segment drift ratios (drift / mean replayed step norm) and the final held-out loss."""
    xtr, ytr, xte, yte = DATA
    w = init(np.random.default_rng(seed))
    orng = np.random.default_rng(10_000 + seed)
    batches = [orng.integers(0, len(ytr), BATCH) for _ in range(T)]
    ws = [w]
    for t in range(T):
        w = w - (1 - eta[t]) * lr_at(t, T, LR0) * grad(w, xtr[batches[t]], ytr[batches[t]])
        ws.append(w)
    ratios = []
    for j in range(N):
        t0, wr, norms = j * S, ws[j * S], []
        for t in range(t0, t0 + S):
            d = -lr_at(t, T, LR0) * grad(wr, xtr[batches[t]], ytr[batches[t]], low_precision=True)
            norms.append(float(np.linalg.norm(d)))
            wr = wr + d
        ratios.append(float(np.linalg.norm(ws[t0 + S] - wr)) / float(np.mean(norms)))
    return ratios, float(loss(ws[-1], xte, yte))


def job(args):
    seed, name, W, place = args
    r, l = run_one(seed, eta_schedule(W, place))
    return seed, name, r, l


def catch(q, k):
    return 1.0 - comb(N - q, k) / comb(N, k)


def main():
    from multiprocessing import Pool
    tasks = [(sd, "honest", 0, "none") for sd in CAL_SEEDS] + [(sd, n, W, p) for sd in TEST_SEEDS for n, W, p in configs()]
    with Pool(4) as pool:
        out = pool.map(job, tasks)
    cal = [r for sd, n, r, l in out if sd in CAL_SEEDS]
    res = {}
    for sd, n, r, l in out:
        if sd in TEST_SEEDS:
            res.setdefault(n, {})[sd] = {"ratios": r, "loss": l}
    allcal = [x for r in cal for x in r]
    rho = max(allcal)
    rho72 = 0.2267  # milestone 72 maximum at s = 20, the threshold milestone 75 used
    json.dump({"rho": rho, "cal_ratios": cal, "res": res}, open(os.path.join(HERE, "results.json"), "w"))
    L = [f"Calibration: {len(CAL_SEEDS)} honest seeds x {N} segments (s = {S}) = {len(allcal)} segments; "
         f"rho = max ratio = {rho:.4f}, p99 = {np.quantile(allcal, 0.99):.4f}, median = {np.median(allcal):.4f}; "
         f"milestone 72 max was {rho72}.",
         f"Test: {len(TEST_SEEDS)} seeds, budget E = {E:g} step-equivalents withheld, N = {N} segments per job.",
         "flag = share of segments flagged; q = flagged segments per job (mean); P(k) = mean over seeds of 1 - C(N-q,k)/C(N,k);",
         "dL = held-out loss minus the same seed's honest run (mean [95% bootstrap CI]).",
         f"  {'config':<14} {'eta':>6}  {'dL mean [95% CI]':<30} {'flag':>6} {'q':>5}  " + "  ".join(f"P(k={k})" for k in KS)]
    base = {sd: res["honest"][sd]["loss"] for sd in TEST_SEEDS}
    for n, W, p in configs():
        d = np.array([res[n][sd]["loss"] - base[sd] for sd in TEST_SEEDS])
        lo, hi = bootstrap_ci(d) if W else (0.0, 0.0)
        qs = [sum(x > rho for x in res[n][sd]["ratios"]) for sd in TEST_SEEDS]
        P = [np.mean([catch(q, k) for q in qs]) for k in KS]
        eta = E / W if W else 0.0
        L.append(f"  {n:<14} {eta:>6.3f}  {d.mean():+.4f} [{lo:+.4f}, {hi:+.4f}]      {np.mean(qs) / N:>6.3f} {np.mean(qs):>5.2f}  "
                 + "  ".join(f"{x:>6.3f}" for x in P))
    L.append(f"Same table's flag column at milestone 72's threshold rho = {rho72} (sensitivity):")
    for n, W, p in configs():
        qs = [sum(x > rho72 for x in res[n][sd]["ratios"]) for sd in TEST_SEEDS]
        L.append(f"  {n:<14} flag {np.mean(qs) / N:.3f}  P(k=5) {np.mean([catch(q, 5) for q in qs]):.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
