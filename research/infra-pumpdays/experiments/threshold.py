"""How much extra demand can Net3 take before the 310 kW booster is forced on? For demand multipliers m from 0.90 to 1.20,
simulate every schedule with one on-run (and 24 h on, off), and report the lowest peak among those feasible (drift 0.1 %).
   PYTHONPATH=src python experiments/threshold.py > experiments/results_threshold.txt   (about 6 minutes on 4 cores)"""
import sys
import multiprocessing as mp
from functools import partial
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_pumpdays.masks import runs_masks  # noqa: E402
from infra_pumpdays.net import feasible, simulate, total_kw  # noqa: E402


def one(mask, m):
    r = simulate(mask, m)
    return feasible(r, 0.001), float(total_kw(r).max()), float(total_kw(r).sum() * 0.25)


def main():
    masks = [m for m in runs_masks() if int(((np.array(m) != np.roll(m, 1)) & np.array(m)).sum()) <= 1]
    print(f"{len(masks)} one-run masks (plus off and 24 h)\nm | feasible | lowest feasible peak kW | its kWh/day")
    with mp.get_context("spawn").Pool(4) as p:
        for m in (0.9, 0.95, 1.0, 1.005, 1.01, 1.015, 1.02, 1.04, 1.06, 1.08, 1.10, 1.15, 1.20):
            rows = p.map(partial(one, m=m), masks, chunksize=16)
            f = [(pk, e) for ok, pk, e in rows if ok]
            if f:
                pk, e = min(f)
                print(f"{m:.3f} | {len(f)} | {pk:.0f} | {e:,.0f}", flush=True)
            else:
                print(f"{m:.3f} | 0 | none | none", flush=True)


if __name__ == "__main__":
    main()
