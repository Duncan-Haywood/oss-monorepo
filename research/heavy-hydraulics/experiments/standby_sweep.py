"""Milestone 2o: how far does the unsourced LS standby flow move 2n's break-even margin?

2n (PVG 32 neutral drop, p_n 10.91 bar) gave a break-even dp_ls of 28.0 bar with LS standby flow ASSUMED at 2 L/min.
No pump datasheet read so far gives a standby flow, so sweep it: 0, 1, 2, 4, 6, 8, 10 L/min. Reuses 2g's `ratio`.

    python3 experiments/standby_sweep.py > experiments/standby_sweep_results.txt
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import physics_cycle as pc
from idle_models import ratio
from ranking_map import crossing
from pvg_neutral import p_n

DPLS = tuple(range(10, 42, 2))
QSB = (0.0, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0)

if __name__ == "__main__":
    pn = p_n(pc.Q_PUMP)
    print(f"load factor 0.346; p_n {pn:.2f} bar (PVG 32 reading); 600 cycles x seeds per cell; pump {pc.Q_PUMP:g} L/min")
    for q in QSB:
        ys = [ratio(0.346, pn, q, n_per_seed=600, dp_ls=float(d))[0] for d in DPLS]
        x = crossing(DPLS, ys)
        at = {d: ratio(0.346, pn, q, n_per_seed=600, dp_ls=float(d))[0] for d in (14.0, 25.0)}
        print(f"q_sb {q:g} L/min: break-even dp_ls = " + (f"{x:.1f} bar" if x else "none in range") +
              f"; LS/OC at 14 bar {at[14.0]:.3f}, at 25 bar {at[25.0]:.3f}")
