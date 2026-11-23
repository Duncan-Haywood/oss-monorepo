"""Milestone 91: which float32 arbiter threshold closes the outlier zones of milestone 90 without convicting honest
workers? (H1/H4 link; data for analyze.py)

Milestone 90's arbiter-only audit (10x the zone's honest calibration maximum, 5-segment zones) missed whole zones,
each set by one large honest calibration value. This run generates the per-segment statistics for a pre-registered
family of threshold rules (LOG.md): calibration seeds 100 to 139 (milestone 89's) plus 140 to 179 (new), a
selection set 200 to 239 (milestone 90's test seeds, already analysed) and a fresh holdout 300 to 339 that no rule
was chosen on. Everything per run is milestone 89's `job`, imported unchanged.

Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; 4 processes, about 35 minutes). Writes results.json
(gitignored size: run it to reproduce; analyze.py writes results.txt and summary.json)."""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m89_run", os.path.join(HERE, "..", "precision_forgery", "run.py"))
m89 = importlib.util.module_from_spec(_spec)
sys.modules["m89_run"] = m89
_spec.loader.exec_module(m89)

CAL_SEEDS = tuple(range(100, 140))
CAL2_SEEDS = tuple(range(140, 180))
DEV_SEEDS = tuple(range(200, 240))
HOLD_SEEDS = tuple(range(300, 340))


def main():
    from multiprocessing import Pool
    opts = tuple(os.environ.get("OPTS", ",".join(m89.OPTS)).split(","))
    seeds = CAL_SEEDS + CAL2_SEEDS + DEV_SEEDS + HOLD_SEEDS
    if os.environ.get("SEEDS"):
        seeds = tuple(int(v) for v in os.environ["SEEDS"].split(","))
    jobs = [(o, sc, sd) for o in opts for sc in m89.SCHEDULES for sd in seeds]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        res_list = pool.map(m89.job, jobs, chunksize=1)
    res = {"T": m89.T, "S": m89.S, "N": m89.N, "qs": list(m89.QS), "opts": {k: list(v) for k, v in m89.OPTS.items()},
           "cal_seeds": list(CAL_SEEDS), "cal2_seeds": list(CAL2_SEEDS), "dev_seeds": list(DEV_SEEDS),
           "hold_seeds": list(HOLD_SEEDS), "runs": {}}
    for name, sched, seed, out, _losses in res_list:
        # keep only the float32 reorder arbiter's statistics: the fp16 referee is not part of this milestone
        res["runs"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = {"reorder": out["reorder"]}
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
