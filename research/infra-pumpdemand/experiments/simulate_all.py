"""Simulate the shipped schedule and every <=2-run mask at a 900 s step; cache to experiments/cache.npz (not committed, ~40 MB).
   PYTHONPATH=src python experiments/simulate_all.py   (about 12 minutes on 4 cores)"""
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_pumpdemand.masks import runs_masks  # noqa: E402
from infra_pumpdemand.net import simulate, window  # noqa: E402


def one(mask):
    r = simulate(mask)
    return np.concatenate([r["kw"]["10"], r["kw"]["335"], [r["min_pressure"], r["tank_margin"], r["drift_m3"], r["demand_m3"]]])


def main():
    masks = runs_masks()
    shipped = window(1, 14)
    assert shipped in set(masks)
    with Pool(4) as p:
        rows = p.map(one, masks, chunksize=64)
    np.savez_compressed(HERE / "cache.npz", masks=np.array(masks, bool), rows=np.array(rows))
    print(len(masks), "masks simulated")


if __name__ == "__main__":
    main()
