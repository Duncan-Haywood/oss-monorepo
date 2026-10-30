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
python3 experiments/m4b_crosscheck/crosscheck.py && python3 experiments/m4b_crosscheck/sensitivity.py   # SIMPLER vs authors' dicts
python3 experiments/m4c_cluster/cluster.py                            # cluster bootstrap
python3 experiments/m4e_transfer/transfer.py                          # held-out task / policy calibration
python3 experiments/m4f_ranking/ranking.py                              # real trials needed to rank policies as well as the twin
# (optional, needs pdftotext and the PDF from arxiv.org/pdf/2405.05941) python3 experiments/m4b_crosscheck/pdf_check.py simpler.pdf
python3 experiments/m7_cartpole/run_pool.py && python3 experiments/m7_cartpole/analyse.py   # second task (cart-pole)
python3 experiments/m7c_cost/run_pool.py && python3 experiments/m7c_cost/analyse.py   # unbounded cost outcome
python3 experiments/m7d_clip/clip.py   # twin-quantile clip level for the unbounded cost
python3 experiments/m7e_clip_cv/clipcv.py   # twin-assisted clipped-cost bound (negative)
python3 experiments/m7f_tailratio/tailratio.py   # tail-ratio k* an upper bound would need (negative)
python3 experiments/m7g_large_n/largen.py   # PPI-EB vs real-only at n up to 1920, analytic crossover (negative)
python3 experiments/m7h_uncapped_betting/uncapped.py   # uncapped betting interval, twin-assisted vs real-only (exact twin mean)
python3 experiments/m7j_n_sweep/n_sweep.py   # finite-twin betting interval over twin pool size and alpha split
python3 experiments/m7i_finite_twin/finite_twin.py   # finite twin pool, union-bound interval
python3 experiments/m7k_cartpole_large_n/large_n.py   # cart-pole, N up to 100,000
python3 experiments/m7l_predictor/predictor.py   # rho and sd ratio vs win (analysis of 7j/7k CSVs)
python3 experiments/m7m_threshold/threshold.py   # threshold on w_real / W_T (negative)
python3 experiments/m7n_residual_width/residual_width.py && python3 experiments/m7n_residual_width/decomposition.py   # residual-interval width vs real-only (needs m7m threshold.csv)
python3 experiments/m7o_ceiling/ceiling.py   # flip and power-scale check of the near-ceiling explanation
python3 experiments/m7q_suresim_setting/suresim_setting.py   # SureSim's stated setting (alpha 0.1, n 60, N 700)
python3 experiments/m7u_suresim_code/suresim_code.py   # SureSim's released interval code in the same setting
# the paper itself (needs pdflatex and bibtex; texlive-latex-recommended): cd paper && pdflatex main && bibtex main && pdflatex main && pdflatex main
