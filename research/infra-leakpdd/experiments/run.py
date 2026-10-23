"""Demand-driven vs pressure-driven simulation of Net3 as demand grows, and what it does to a leak's pressure signal.

   PYTHONPATH=src python experiments/run.py      writes experiments/results.txt (deterministic, no random draws except the seeded location choice)
"""
import sys
import time
import warnings
import numpy as np
from infra_leakpdd import run, junctions, leak_area
from infra_leakpdd.sim import READ

warnings.filterwarnings("ignore")
MULTS = [1.0, 1.25, 1.5, 2.0, 3.0]       # all junction base demands x this (growth or a peak day)
SIZE = 0.02                               # leak flow as a share of mean total demand at m = 1, at the node's pressure at m = 1
REQS = [10.0, 15.0, 25.0]                 # PDD required pressure, m (swept)
N_LOC = 30
K = 5
COVER = 0.5
HERE = __import__("pathlib").Path(__file__).resolve().parent
log = lambda *a: print(*a, file=sys.stderr, flush=True)


def pick_sensors(delta, k):
    chosen, best = [], np.zeros(delta.shape[0])
    for _ in range(k):
        _, s = max((np.log1p(np.maximum(best, delta[:, s])).sum(), s) for s in range(delta.shape[1]) if s not in chosen)
        chosen.append(s)
        best = np.maximum(best, delta[:, s])
    return chosen


def main():
    t0 = time.time()
    J = junctions()
    n = len(J)
    p0, d0, _ = run(1.0)
    mean_dem = d0.sum(axis=1).mean()
    # sensors: greedy on noise-free responses of a 2% leak at every junction, DD, m = 1 (as infra-waterloss)
    areas = [leak_area(SIZE * mean_dem, p0[24, i]) for i in range(n)]
    delta = np.zeros((n, n))
    for i in range(n):
        p, _, _ = run(1.0, False, J[i], areas[i])
        delta[i] = p0[READ] - p[READ]
        delta[i, i] = 0.0
    sens = pick_sensors(delta, K)
    log("sensors", [J[s] for s in sens], time.time() - t0)
    locs = sorted(np.random.default_rng(7).choice(n, N_LOC, replace=False).tolist())
    L = ["# Net3, WNTR, one leak per run (opens hour 24, read at hour 48); demand-driven (DD) vs pressure-driven (PDD)",
         f"# mean total demand at multiplier 1: {mean_dem * 1000:.0f} L/s. Leak area fixed at the 2% size at multiplier 1; {N_LOC} seeded locations; sensors (5, greedy at multiplier 1, DD): " + " ".join(J[s] for s in sens), ""]
    L.append("== A. No leak: how far from physical is DD, and what does PDD (required pressure 15 m) change? (means over the 72 h)")
    L.append("mult | DD: share of junction-hours below 0 m, below 15 m, min pressure m, total demand L/s | PDD: share below 15 m, min pressure m, served demand share of requested")
    rows_A = []
    for m in MULTS:
        pd, dd, _ = run(m, False)
        pp, dp, _ = run(m, True)
        req = d0.sum(axis=1).mean() * m
        L.append(f"{m:g} | {np.mean(pd < 0):.3f} {np.mean(pd < 15):.3f} {pd.min():.1f} {dd.sum(axis=1).mean() * 1000:.0f} | {np.mean(pp < 15):.3f} {pp.min():.1f} {dp.sum(axis=1).mean() / req:.3f}")
        rows_A.append(m)
        log("A", m, time.time() - t0)
    L.append("")
    L.append("== B. Leak response at the 5 sensors, 24 h after onset, DD vs PDD (15 m). Columns: mean leak flow DD, PDD (% of m=1 mean demand) | median sensor drop m: DD, PDD | median |DD-PDD| at sensors m | locations 'covered' (>0.5 m at some sensor) DD, PDD, disagree")
    for m in MULTS:
        pb = {pdd: run(m, pdd)[0] for pdd in (False, True)}
        out = {False: [], True: []}
        for li in locs:
            for pdd in (False, True):
                p, _, lk = run(m, pdd, J[li], areas[li])
                out[pdd].append((pb[pdd][READ, sens] - p[READ, sens], lk[READ]))
        dd = np.array([o[0] for o in out[False]]); pp = np.array([o[0] for o in out[True]])
        fd = np.mean([o[1] for o in out[False]]) / mean_dem * 100; fp = np.mean([o[1] for o in out[True]]) / mean_dem * 100
        cd, cp = dd.max(axis=1) > COVER, pp.max(axis=1) > COVER
        L.append(f"{m:g} | {fd:.2f} {fp:.2f} | {np.median(dd.max(axis=1)):.3f} {np.median(pp.max(axis=1)):.3f} | {np.median(np.abs(dd - pp).max(axis=1)):.3f} | {cd.sum()} {cp.sum()} {(cd != cp).sum()}")
        log("B", m, time.time() - t0)
    L.append("")
    L.append("== C. PDD required pressure sweep at multiplier 2: served share of demand, share of junction-hours below the required pressure")
    for rq in REQS:
        pp, dp, _ = run(2.0, True, req=rq)
        L.append(f"req {rq:g} m: served {dp.sum(axis=1).mean() / (mean_dem * 2):.3f}, share below req {np.mean(pp < rq):.3f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
