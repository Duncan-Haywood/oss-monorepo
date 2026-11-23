"""Milestone 90: does the zoned float32 arbiter, run alone, catch precision forgeries on fresh seeds, and which audit
catches more per unit of audit compute? (H1/H4 link; data for analyze.py)

Milestone 89 found the fp16 replay referee blind to a worker who computes its last steps in float16 or bfloat16, and,
post hoc, that the float32 reorder arbiter with zoned thresholds, run on every segment, convicts such forgeries. This
run fixes that audit in advance and evaluates it on fresh test seeds 200 to 239 (calibration seeds 100 to 139 as
milestone 89). Everything per run is milestone 89's `job`, imported unchanged; analyze.py applies the audits.

Run: OMP_NUM_THREADS=1 python3 run.py   (numpy + scikit-learn; 4 processes, about 15 minutes). Writes results.json
(gitignored size: run it to reproduce; analyze.py writes results.txt and summary.json). Rules are in LOG.md, fixed
before the run."""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m89_run", os.path.join(HERE, "..", "precision_forgery", "run.py"))
m89 = importlib.util.module_from_spec(_spec)
sys.modules["m89_run"] = m89
_spec.loader.exec_module(m89)

TEST_SEEDS = tuple(range(200, 240))
CAL_SEEDS = m89.CAL_SEEDS


def main():
    from multiprocessing import Pool
    opts = tuple(os.environ.get("OPTS", ",".join(m89.OPTS)).split(","))
    seeds = TEST_SEEDS + CAL_SEEDS
    if os.environ.get("SEEDS"):
        seeds = tuple(int(v) for v in os.environ["SEEDS"].split(","))
    jobs = [(o, sc, sd) for o in opts for sc in m89.SCHEDULES for sd in seeds]
    with Pool(int(os.environ.get("PROCS", 4))) as pool:
        res_list = pool.map(m89.job, jobs, chunksize=1)
    res = {"T": m89.T, "S": m89.S, "N": m89.N, "qs": list(m89.QS), "precs": list(m89.PRECS),
           "sub_bs": list(m89.SUB_BS), "sub_qs": list(m89.SUB_QS), "opts": {k: list(v) for k, v in m89.OPTS.items()},
           "test_seeds": list(TEST_SEEDS), "cal_seeds": list(CAL_SEEDS), "runs": {}, "losses": {}}
    for name, sched, seed, out, losses in res_list:
        res["runs"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = out
        res["losses"].setdefault(name, {}).setdefault(sched, {})[str(seed)] = losses
    fn = os.environ.get("OUT", "results.json")
    json.dump(res, open(os.path.join(HERE, fn), "w"), separators=(",", ":"))
    print("wrote", fn, len(res_list), "jobs")


if __name__ == "__main__":
    main()
