"""Milestone 84: does the learning-rate schedule alone predict where a stalled segment does harm?
(H1/H4 link; data for analyze.py)

Milestone 82 measured the held-out loss added by stalling one s = 20 segment at each of N = 75 positions under three
schedules. This run repeats that measurement, with milestone 82's code imported unchanged, on four schedules it has
not seen, each rescaled so its learning rates sum to 150 like milestone 82's:
  step     0.15 for steps 0-749, then 0.05
  linear   0.2 falling linearly to 0
  warmcos  linear warmup from 0 over 150 steps, then cosine to 0 over 1,350 steps (peak about 0.2)
  sgdr     two cosine cycles of 750 steps, each from 0.2 to 0 (Loshchilov and Hutter 2017, arXiv:1608.03983)
Per test seed (0-39) and schedule: honest loss, loss after stalling each segment, the stalled segment's fp16 and
reorder statistics, four random 5-segment stall sets; calibration seeds 100-109 per schedule.
Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; about 6 minutes on 4 processes). Writes results.json."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m82_run", os.path.join(HERE, "..", "harm_weighted_sampling", "run.py"))
m82 = importlib.util.module_from_spec(_spec)
sys.modules["m82_run"] = m82
_spec.loader.exec_module(m82)

T, S, N = m82.T, m82.S, m82.N
SCHEDULES = ("step", "linear", "warmcos", "sgdr")
TOTAL = 150.0


def lr_sched(name):
    t = np.arange(T, dtype=float)
    if name == "step":
        raw = np.where(t < 750, 0.15, 0.05)
    elif name == "linear":
        raw = 0.2 * (1 - (t + 0.5) / T)
    elif name == "warmcos":
        w = 150
        raw = np.where(t < w, (t + 0.5) / w, 0.5 * (1 + np.cos(np.pi * (t - w) / (T - w))))
    elif name == "sgdr":
        raw = 0.5 * (1 + np.cos(np.pi * (t % 750) / 750))
    else:
        return m82_sched(name)
    return raw * (TOTAL / raw.sum())


m82_sched = m82.lr_sched
m82.lr_sched = lr_sched  # m82.test_job / cal_job look the schedule up in their module's globals


def test_job(args):
    return m82.test_job(args)


def cal_job(args):
    return m82.cal_job(args)


def main():
    from multiprocessing import Pool
    procs = int(os.environ.get("PROCS", 4))
    with Pool(procs) as pool:
        tests = pool.map(test_job, [(sd, sc) for sc in SCHEDULES for sd in m82.TEST_SEEDS])
        cals = pool.map(cal_job, [(sd, sc) for sc in SCHEDULES for sd in m82.CAL_SEEDS])
    res = {"T": T, "S": S, "N": N, "schedules": {}}
    for sc in SCHEDULES:
        lrs = lr_sched(sc)
        res["schedules"][sc] = {
            "lr": [m82.g7(v) for v in lrs[::S]],
            "seg_lr": [m82.g7(v) for v in lrs.reshape(N, S).sum(1)],
            "test": {str(sd): {"honest": base, "single": single, "sets": sets}
                     for sd, s2, base, single, sets in tests if s2 == sc},
            "cal": {str(sd): o for sd, s2, o in cals if s2 == sc}}
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"))
    print("wrote results.json:", len(tests), "test jobs,", len(cals), "calibration jobs")


if __name__ == "__main__":
    main()
