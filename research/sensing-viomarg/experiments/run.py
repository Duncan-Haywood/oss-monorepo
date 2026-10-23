"""Pinned prior vs Schur-complement marginalisation prior, by IMU grade and path length (synthetic).

    python experiments/run.py [seeds] [T]     # writes results_T<T>.txt; set OMP_NUM_THREADS=1
"""
import os
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from sensing_viomarg import Setup, make_world, simulate_sensors, run_vio_marg, drift_percent  # noqa: E402

BASE = Setup()
CONFIGS = []
for m in (0.25, 1, 4):
    for marg in (False, True):
        CONFIGS.append((f"IMU x{m}", "marginalised" if marg else "pinned", BASE.with_imu_scale(m, m), marg))


def job(a):
    ci, seed, T = a
    s, marg = CONFIGS[ci][2], CONFIGS[ci][3]
    w = make_world(seed, T=T)
    se = simulate_sensors(w, s, seed)
    return ci, seed, drift_percent(w, se, run_vio_marg(w, s, se, marginalise=marg))


def main():
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    T = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
    jobs = [(ci, k, T) for ci in range(len(CONFIGS)) for k in range(seeds)]
    with Pool(4) as p:
        res = p.map(job, jobs, chunksize=1)
    by = {}
    for ci, k, r in res:
        by.setdefault(ci, {})[k] = r
    out = [f"# sensing-viomarg: planar VIO drift, {seeds} seeds, {T:.0f} s paths, synthetic",
           "# columns: IMU grade | prior | rms drift % of path (mean, sem) | median rms | worst seed rms | final drift % mean | rms vs pinned at same grade (paired geometric-mean ratio)"]
    for ci, (grade, prior, s, marg) in enumerate(CONFIGS):
        rms = np.array([by[ci][k][1] for k in range(seeds)])
        fin = np.array([by[ci][k][0] for k in range(seeds)])
        ref = np.array([by[ci - (1 if marg else 0)][k][1] for k in range(seeds)])
        ratio = float(np.exp(np.mean(np.log(rms / ref))))
        sem = rms.std(ddof=1) / np.sqrt(seeds)
        out.append(f"{grade} | {prior} | {rms.mean():.3f} {sem:.3f} | {np.median(rms):.3f} | {rms.max():.3f} | {fin.mean():.2f} | {ratio:.2f}")
    open(os.path.join(HERE, f"results_T{int(T)}.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
