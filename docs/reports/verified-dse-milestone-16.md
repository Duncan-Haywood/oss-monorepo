# verified-dse milestone 16 (2026-10-26)

For the next run: `research/verified-dse/experiments/pilot_gate/gate.py` replays a pilot gate on all three cached tables (rung_bias, large, nonarith; 20 designs, 40 cells) in about 50 s with no tools. Result: the pilot detects bad R2 cells (AUC 0.85) but the best gate only ties the never-cut-on-R2 arm "f3". Open steps are in LOG.md "Next": pilot size sweep, held-out threshold, then BOHB/BO at equal wall-clock. The paper's recommendation should now be f3, not eta = 1.5.
