# Example data

`lee-simulated.csv` is simulated, not observed. It has 1,000 rows drawn by
`eval/simulate.py` (numpy PCG64, seed 20140101) from the Lee (2008)
calibration used in the simulations of Calonico, Cattaneo & Titiunik (2014,
Econometrica 82(6)), their Model 1:

- `vote_margin` = 2 Beta(2, 4) - 1, the running variable, cutoff 0;
- `next_vote_share` = a fifth-order polynomial in the margin on each side
  (coefficients in `simulate.py`) plus normal noise with sd 0.1295; the true
  jump at 0 is 0.52 - 0.48 = 0.04;
- `prior_share` = 0.3 + 0.5 margin + normal noise with sd 0.2, smooth through
  the cutoff (a placebo covariate).

Generated 2026-11-17. The polynomial coefficients are the published
calibration; no data from Lee's paper or any package are included.
`eval/fuzzy.csv` (partial take-up, true effect 0.5) and `eval/ties.csv`
(an integer score with ties, true jump 3.0) come from the same script.
