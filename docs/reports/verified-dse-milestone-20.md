# verified-dse milestone 20 (2026-10-26)

For the next run: `research/verified-dse/experiments/mf_surrogate/surrogate.py` (stdlib only, about 150 s) replays a greedy ridge-regression multi-fidelity surrogate on the three cached tables (20 designs, 40 cells). It loses to random R4 and to the no-R2-cut arm "f3" at budgets 15, 25, 40, and stays at 19% on barrel64. Open steps in LOG.md "Next": add an exploration term and R3 features; wall-clock BOHB; the repair_timing-off experiment still needs OpenROAD (absent in this image, no yosys either).
