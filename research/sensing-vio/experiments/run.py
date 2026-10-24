"""Drift of a planar visual-inertial smoother against camera and IMU quality (synthetic).

    python experiments/run.py [seeds] [T]     # writes results.txt; ~15 min on 4 cores, set OMP_NUM_THREADS=1
"""
import os
import sys
from dataclasses import replace
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from sensing_vio import Setup, make_world, simulate_sensors, run_vio, drift_percent  # noqa: E402

BASE = Setup()
CONFIGS = [("base", "base", BASE)]
for w in (80, 160, 320, 1280):
    CONFIGS.append(("A", f"width {w}px", replace(BASE, width_px=w)))
for f in (5, 20):
    CONFIGS.append(("A", f"{f} fps", replace(BASE, fps=float(f))))
for m in (0.25, 0.5, 2, 4):
    CONFIGS.append(("B", f"gyro x{m}", BASE.with_imu_scale(m, 1)))
for m in (0.25, 0.5, 2, 4):
    CONFIGS.append(("B", f"accel x{m}", BASE.with_imu_scale(1, m)))
CONFIGS.append(("C", "width 160 + IMU x0.25", replace(BASE, width_px=160).with_imu_scale(0.25, 0.25)))
CONFIGS.append(("C", "width 1280 + IMU x4", replace(BASE, width_px=1280).with_imu_scale(4, 4)))
CONFIGS.append(("C", "IMU x0.25 both", BASE.with_imu_scale(0.25, 0.25)))
CONFIGS.append(("C", "IMU x4 both", BASE.with_imu_scale(4, 4)))


def job(a):
    ci, seed, T = a
    s = CONFIGS[ci][2]
    w = make_world(seed, T=T)
    se = simulate_sensors(w, s, seed)
    return ci, seed, drift_percent(w, se, run_vio(w, s, se))


def main():
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    T = float(sys.argv[2]) if len(sys.argv) > 2 else 12.0
    jobs = [(ci, k, T) for ci in range(len(CONFIGS)) for k in range(seeds)]
    with Pool(4) as p:
        res = p.map(job, jobs, chunksize=1)
    out = [f"# sensing-vio: planar VIO drift, {seeds} seeds, {T:.0f} s paths, synthetic",
           "# columns: group | setting | rms drift % of path (mean, sem) | final drift % (mean, median) | rms vs base (paired ratio)"]
    by = {}
    for ci, k, r in res:
        by.setdefault(ci, {})[k] = r
    base = np.array([by[0][k][1] for k in range(seeds)])
    out.append("## A. one knob at a time")
    for ci, (g, name, s) in enumerate(CONFIGS):
        rms = np.array([by[ci][k][1] for k in range(seeds)])
        fin = np.array([by[ci][k][0] for k in range(seeds)])
        ratio = float(np.exp(np.mean(np.log(rms / base))))
        sem = rms.std(ddof=1) / np.sqrt(seeds)
        out.append(f"{g} | {name} | {rms.mean():.3f} {sem:.3f} | {fin.mean():.2f} {np.median(fin):.2f} | {ratio:.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
