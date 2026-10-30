# sim2real-inference m7n: for the next run

- Result: the betting interval for the residual R - T plus the twin-mean interval reproduces the combined interval (median error 0.4%, 336 cells). The win is decided by residual interval vs real-only interval. A variance-only model of that ratio fails (median error 33%; cart-pole about 48%, where the residual interval alone is wider than the real-only one).
- Post hoc (not pre-registered): the model's miss correlates with mean R (Spearman 0.81). Hypothesis: the real-only interval benefits from an outcome near its ceiling (cart-pole mean R 0.84, pendulum 0.67).
- Next (m7o): shift the outcome (use 1 - R, or a monotone transform with mean 1/2) and see whether the real-only advantage and the cart-pole losses move. Then the paper: the m7k to m7n paragraph is in, the abstract is not updated.
- Run it: `experiments/m7n_residual_width/residual_width.py 200` (about 2 min on 4 cores), then `decomposition.py`.
