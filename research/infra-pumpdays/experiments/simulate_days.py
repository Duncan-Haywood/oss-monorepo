"""Simulate the shipped schedule and every <=2-run mask on a day with all Net3 demands scaled by m; cache each m to
experiments/cache_<m>.npz (not committed).
   PYTHONPATH=src python experiments/simulate_days.py 0.8 1.0 1.2     (about 10 minutes per multiplier on 4 cores)"""
import sys
import multiprocessing as mp
from pathlib import Path
from functools import partial

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_pumpdays.masks import runs_masks  # noqa: E402
from infra_pumpdays.net import simulate  # noqa: E402


def one(mask, mult):
    r = simulate(mask, mult)
    return np.concatenate([r["kw"]["10"], r["kw"]["335"], [r["min_pressure"], r["tank_margin"], r["drift_m3"], r["demand_m3"]]])


def main():
    masks = runs_masks()
    for m in map(float, sys.argv[1:]):
        with mp.get_context("spawn").Pool(4) as p:
            rows = p.map(partial(one, mult=m), masks, chunksize=32)
        np.savez_compressed(HERE / f"cache_{m:g}.npz", masks=np.array(masks, bool), rows=np.array(rows))
        print(m, len(masks), "masks simulated", flush=True)


if __name__ == "__main__":
    main()
