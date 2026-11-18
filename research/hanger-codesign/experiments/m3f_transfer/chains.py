"""Milestone 3f, phase 1: rebuild the jersey (A) source states of milestone 3e (its chain_job, unchanged).

    python3 experiments/m3f_transfer/chains.py      (about 85 min on 4 cores; resumable)

3e kept its end states in a gitignored cache, so they are recomputed here; 3e's chains reproduced 3d's
to the last digit, so this step is expected to reproduce 3e's rows exactly (checked in run.py's report).
"""
import importlib.util
import sys
import multiprocessing as mp
from pathlib import Path

HERE = Path(__file__).resolve().parent
_s = importlib.util.spec_from_file_location("m3e_run", HERE.parent / "m3e_pooled" / "run.py")
m3e = importlib.util.module_from_spec(_s)
sys.modules["m3e_run"] = m3e                      # so pool workers can pickle its functions
_s.loader.exec_module(m3e)


def job(j):
    return m3e.chain_job(j)

if __name__ == "__main__":
    cache = HERE / "cache"
    cache.mkdir(exist_ok=True)
    jobs = [("A", a, s, str(cache)) for a in sorted(m3e.LATS) for s in m3e.SEEDS]
    with mp.Pool(4) as pool:
        list(pool.imap_unordered(job, jobs, chunksize=1))
    print("DONE", flush=True)
