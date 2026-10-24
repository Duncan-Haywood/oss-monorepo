#!/bin/sh
# One command per figure/table; run from research/sim2real-inference. Times are on 4 cores.
set -e
PYTHONPATH=src python3 -m unittest discover -s tests            # estimator tests
python3 experiments/m3_benchmark/run_pool.py                     # pools, ~4 min
python3 experiments/m3_benchmark/analyse.py                      # H1, H2, H6 (Fig. 1)
python3 experiments/m3_benchmark/figure.py
python3 experiments/m3b_intervals/intervals.py                   # bootstrap intervals
python3 experiments/m3c_dfree/dfree.py                           # Table 1 rows
python3 experiments/m3d_betting/betting.py
python3 experiments/m3e_bounded_disc/bounded.py
python3 experiments/m3f_failure_rate/failrate.py
python3 experiments/m5a_active/active.py                         # ~20 min
python3 experiments/m5b_anytime/anytime.py
python3 experiments/m6_floor/floor.py                            # floor and Monte Carlo check
python3 experiments/m6b_dfloor/dfloor.py
python3 experiments/m6c_quantile/quantile.py
python3 experiments/m4_simpler/analyse.py                        # SIMPLER
python3 experiments/m7_cartpole/run_pool.py && python3 experiments/m7_cartpole/analyse.py   # second task (cart-pole)
