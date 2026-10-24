"""Leak detection from pressure residuals on EPANET's Net3 with WNTR: sensors, demand uncertainty, three detectors.

   PYTHONPATH=src python experiments/run.py      (about 15 min on 4 cores; hydraulics cached in $WATERLOSS_CACHE)
Writes experiments/results.txt. Deterministic: every random draw is seeded.
"""
import os
import sys
import time
import numpy as np
from multiprocessing import Pool
from pathlib import Path

from infra_waterloss import simulate, junctions, HOURS
from infra_waterloss.detect import first_alarm_ma, first_alarm_cusum, first_alarm_pelt

HERE = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("WATERLOSS_CACHE", "/tmp/waterloss_cache"))
CACHE.mkdir(parents=True, exist_ok=True)
TRAIN, LEAK = 48, 96                       # hours: leak-free training window; leak starts at hour 96 of 168
K_SENS = 15                                # sensors chosen greedily; conditions use the first 5 or all 15
SIZES = [0.0025, 0.005, 0.01, 0.02, 0.04]  # leak flow as a share of the mean total demand
N_CAL, N_LOC = 120, 60
FA_TARGET = 0.05                           # share of leak-free weeks that may raise any alarm after the training window
D_LEVELS = {"low": (0.05, 0.01), "base": (0.10, 0.03), "high": (0.20, 0.05)}   # (node sd, system sd) of demand error
FLOW_NOISE = 0.005                         # sd of the inflow meter, share of mean inflow (assumed)
CONDITIONS = [("base", 0.05, 5), ("base", 0.25, 5), ("base", 1.0, 5), ("low", 0.25, 5), ("high", 0.25, 5), ("base", 0.25, 15)]   # (demand error, pressure sensor sd in m, sensors)
COVER_M = 0.5                              # a leak is "covered" if its noise-free 2% response at some sensor exceeds this many metres
MODES = ["pressure", "flow-adjusted"]
DETS = ["MA3", "CUSUM", "PELT"]
log = lambda *a: print(*a, file=sys.stderr, flush=True)


def _job(a):
    key, kw = a
    f = CACHE / (key + ".npz")
    if f.exists():
        d = np.load(f)
        return key, d["p"], d["leak"], d["dem"]
    p, leak, dem = simulate(**kw)
    np.savez(f, p=p.astype(np.float32), leak=leak, dem=dem)
    return key, p, leak, dem


def run_all(jobs, pool):
    return {k: (p, l, d) for k, p, l, d in pool.imap_unordered(_job, jobs, chunksize=4)}


def pick_sensors(delta, k):
    """Greedy: add the junction that most raises sum over leak locations of log(1 + best |dp| (m) at the chosen sensors)."""
    chosen, best = [], np.zeros(delta.shape[0])
    for _ in range(k):
        gains = [(np.log1p(np.maximum(best, delta[:, s])).sum(), s) for s in range(delta.shape[1]) if s not in chosen]
        _, s = max(gains)
        chosen.append(s)
        best = np.maximum(best, delta[:, s])
    return chosen


def statistic(p, dem, nom_p, nom_dem, mode, sd_p, rng):
    """Scalar leak score z_t (hours) from sensor pressures p (T x S) and total inflow dem (T)."""
    r = p + rng.normal(0, sd_p, p.shape) - nom_p                                  # pressure residual, m
    f = dem * (1 + rng.normal(0, FLOW_NOISE, dem.shape)) - nom_dem               # inflow residual, m3/s
    tr = slice(0, TRAIN)
    if mode == "flow-adjusted":
        A = np.column_stack([np.ones(TRAIN), f[tr]])
        coef = np.linalg.lstsq(A, r[tr], rcond=None)[0]
        r = r - np.column_stack([np.ones(len(f)), f]) @ coef
    else:
        r = r - r[tr].mean(axis=0)
    r = r / (r[tr].std(axis=0) + 1e-9)
    z = -r.mean(axis=1)
    return (z - z[tr].mean()) / (z[tr].std() + 1e-9)


def alarm(det, z, h):
    if det == "MA3":
        return first_alarm_ma(z, h, 3, TRAIN)
    if det == "CUSUM":
        return first_alarm_cusum(z, h, 0.5, TRAIN)
    return first_alarm_pelt(z, h, TRAIN + 6)


GRID = {"MA3": np.linspace(0.5, 8, 31), "CUSUM": np.geomspace(1, 300, 30), "PELT": np.geomspace(4, 600, 14)}


def calibrate(det, zs):
    """Smallest grid threshold whose share of leak-free runs with any alarm after training is <= FA_TARGET."""
    for h in GRID[det]:
        if np.mean([alarm(det, z, h) is not None for z in zs]) <= FA_TARGET:
            return float(h)
    return float(GRID[det][-1])


def analyse(args):
    (dl, sd_p, k, mode, det), cal, tests, nom_p, nom_dem, seed, cov = args
    cal = [(p[:, :k], d) for p, d in cal]
    tests = {sz: [(p[:, :k], d) for p, d in runs] for sz, runs in tests.items()}
    nom_p = nom_p[:, :k]
    rng = np.random.default_rng(seed)
    zc = [statistic(p, d, nom_p, nom_dem, mode, sd_p, rng) for p, d in cal]
    h = calibrate(det, zc)
    out = {"h": h, "fa_cal": float(np.mean([alarm(det, z, h) is not None for z in zc])), "sizes": {}}
    pre = 0
    n = 0
    for size, runs in tests.items():
        det_n, delays, excl, cdet, cn = 0, [], 0, 0, 0
        for li, (p, d) in enumerate(runs):
            z = statistic(p, d, nom_p, nom_dem, mode, sd_p, rng)
            t = alarm(det, z, h)
            n += 1 if size == SIZES[0] else 0
            if t is not None and t < LEAK:
                excl += 1
                pre += 1 if size == SIZES[0] else 0
                continue
            cn += int(cov[li])
            if t is not None:
                det_n += 1
                cdet += int(cov[li])
                delays.append(t - LEAK)
        ok = len(runs) - excl
        out["sizes"][size] = (det_n / ok if ok else float("nan"), float(np.median(delays)) if delays else float("nan"), excl, len(runs), cdet / cn if cn else float('nan'))
    out["fa_test"] = pre / max(n, 1)
    return (dl, sd_p, k, mode, det), out


def main():
    t0 = time.time()
    J = junctions()
    with Pool(4) as pool:
        nom = run_all([("nom", dict())], pool)["nom"]
        nom_p, nom_dem = nom[0], nom[2]
        mean_dem = float(nom_dem.mean())
        log("nominal mean demand m3/s", mean_dem)
        # 1. sensor choice from noise-free leak responses at every junction (leak = 2% of mean demand)
        jobs = [(f"sens{i}", dict(leak_node=J[i], leak_flow_frac=0.02, nominal_pressure=float(nom_p[LEAK, i]), mean_demand=mean_dem)) for i in range(len(J))]
        r = run_all(jobs, pool)
        delta = np.array([nom_p[LEAK + 24] - r[f"sens{i}"][0][LEAK + 24] for i in range(len(J))])      # leak x junction, m
        delta[np.arange(len(J)), np.arange(len(J))] = 0.0       # a sensor at the leak node would be a different design; ignore self-response
        sens = pick_sensors(delta, K_SENS)
        log("sensors", [J[s] for s in sens], time.time() - t0)
        cover = {th: float((delta[:, sens[:5]].max(axis=1) > th).mean()) for th in (0.05, 0.1, 0.25, 0.5, 1.0)}
        # 2. calibration (leak-free) and test (leak) weeks for each level of demand error
        rng = np.random.default_rng(7)
        locs = sorted(rng.choice(len(J), N_LOC, replace=False).tolist())
        data = {}
        stats = {}
        for dl, (sn, ss) in D_LEVELS.items():
            if dl == "high" and False:
                continue
            jobs = [(f"cal_{dl}_{i}", dict(seed=1000 + i, sigma_node=sn, sigma_sys=ss)) for i in range(N_CAL)]
            for si, sz in enumerate(SIZES):
                for li, loc in enumerate(locs):
                    jobs.append((f"t_{dl}_{si}_{li}", dict(seed=5000 + li, sigma_node=sn, sigma_sys=ss, leak_node=J[loc], leak_flow_frac=sz,
                                                          nominal_pressure=float(nom_p[LEAK, loc]), mean_demand=mean_dem)))
            r = run_all(jobs, pool)
            sel = lambda x: (x[0][:, sens].astype(float), x[2])
            cal = [sel(r[f"cal_{dl}_{i}"]) for i in range(N_CAL)]
            tests = {sz: [sel(r[f"t_{dl}_{si}_{li}"]) for li in range(N_LOC)] for si, sz in enumerate(SIZES)}
            data[dl] = (cal, tests)
            stats[dl] = {sz: float(np.mean([r[f"t_{dl}_{si}_{li}"][1][LEAK + 24] for li in range(N_LOC)]) / mean_dem) for si, sz in enumerate(SIZES)}
            log("hydraulics done", dl, time.time() - t0)
        # 3. detectors
        jobs = []
        for ci, (dl, sd_p, k) in enumerate(CONDITIONS):
            cov = (delta[:, sens[:k]].max(axis=1) > COVER_M)[locs]
            for mode in MODES:
                for det in DETS:
                    jobs.append(((dl, sd_p, k, mode, det), data[dl][0], data[dl][1], nom_p[:, sens].astype(float), nom_dem, 100 + ci, cov))
        res = dict(pool.imap_unordered(analyse, jobs))
        log("analysis done", time.time() - t0)
    write(res, J, sens, delta, cover, stats, mean_dem, nom_p)


def write(res, J, sens, delta, cover, stats, mean_dem, nom_p):
    L = []
    L.append("# Net3 (EPANET example network, 92 junctions) leak detection; one week hourly, leak starts at hour 96, training window hours 0-47")
    L.append(f"# mean total demand {mean_dem * 1000:.0f} L/s; 5 or 15 pressure sensors; {N_CAL} leak-free calibration weeks and {N_LOC} leak locations x {len(SIZES)} sizes per demand-error level")
    L.append("")
    L.append("== A. Sensors and coverage")
    L.append("sensors " + " ".join(J[s] for s in sens) + "  (mean nominal pressure " + " ".join(f"{nom_p[:, s].mean():.1f}" for s in sens) + " m)")
    L.append("share of the 92 leak locations whose 2% leak lowers some of the first 5 sensors by more than x metres (noise-free, 24 h after onset; the sensor at the leak itself is ignored):")
    L.append("x_m " + " ".join(str(k) for k in cover))
    L.append("share " + " ".join(f"{v:.2f}" for v in cover.values()))
    L.append("")
    L.append("== B. Realised leak flow, % of mean total demand, by requested size (mean over locations, 24 h after onset)")
    L.append("requested_pct " + " ".join(f"{s * 100:g}" for s in SIZES))
    for dl in D_LEVELS:
        L.append(f"{dl} " + " ".join(f"{stats[dl][s] * 100:.2f}" for s in SIZES))
    L.append("")
    for ci, (dl, sd_p, k) in enumerate(CONDITIONS):
        cv = (delta[:, sens[:k]].max(axis=1) > COVER_M)
        L.append(f"== C{ci + 1}. demand error {dl} (node sd {D_LEVELS[dl][0]}, system sd {D_LEVELS[dl][1]}), pressure sensor sd {sd_p} m, {k} sensors ({cv.mean():.0%} of leak locations covered)")
        L.append("mode det threshold fa_cal fa_test | detection rate, all leaks | detection rate, covered leaks only | median delay h   [columns: leak size % of demand: " + " ".join(f"{s * 100:g}" for s in SIZES) + "]")
        for mode in MODES:
            for det in DETS:
                o = res[(dl, sd_p, k, mode, det)]
                rate = " ".join(f"{o['sizes'][s][0]:.2f}" for s in SIZES) + " | " + " ".join(f"{o['sizes'][s][4]:.2f}" for s in SIZES)
                dly = " ".join(f"{o['sizes'][s][1]:g}" for s in SIZES)
                L.append(f"{mode} {det} {o['h']:.3g} {o['fa_cal']:.2f} {o['fa_test']:.2f} | {rate} | {dly}")
        L.append("")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
