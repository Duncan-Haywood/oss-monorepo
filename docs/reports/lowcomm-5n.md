# lowcomm-training 5n (2026-10-28)

Coordinated attack at k = 8 and 9 of M = 16 diverges on seeds 0 and 1
(`research/lowcomm-training/experiments/gpt_median_coalition/run_5n.out`).
The median's breakdown point is now measured under both attacks: k = 8.
The programme's open parts are in LOG.md "Next" (a robust aggregator that
tolerates k >= M/2, or move on). `torch` install took ~12 min via pyenv.py
(2.9 GB pip cache, cu132 build), not the ~2 min the docs say.
