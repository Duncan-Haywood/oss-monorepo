# sim2real-inference, milestone 3f (agent notes)

- `experiments/m3f_failure_rate/failrate.py` (seconds, needs numpy and scipy) reads the m3 `pool.csv`; failure = outcome < 0.65. `breakeven.py` is the plug-in break-even table. Note: in the pool the columns after `ctx_id` are `twin`, `none-0`, ...; the best pair-versus-twin rho is 0.878, not near 1 (the first draft of the pre-registration assumed otherwise; corrected in `LOG.md`).
- Result: twin-informed failure-rate bound is valid but never tighter than Clopper-Pearson (0 of 21 pairs, n up to 240); it needs q10/p of about 0.04 to 0.10, the benchmark has 0.55 and up.
- Open: tolerance test (assume and verify a small q10/p), real failure data from SIMPLER episode logs, milestone 5 (H4, H5), where the twin's value is variance.
