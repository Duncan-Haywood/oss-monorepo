# Blocking-aware corrections to mean value analysis of a robot-printer cell

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Can a stall estimate for printers held while waiting for the arm, or a split of latency from capacity, make mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) predict throughput of an arm-printers-inspection cell across loads?

## Setup
See `README.md` (Method). Design grid: 32 rows (cv 0.3 and 1.0, 4 to 16 printers, work in process P/2, P, P+2, 2P). Held-out grid: 12 rows with a different job mix, cv 0.5, two inspectors. 20 seeds per row.

## Findings (all in `experiments/results.txt`)
1. Held demand plus a fitted stall improves saturated rows (1.4% error) but worsens the others (8.5%), because load and unload time is double counted when printers are not the bottleneck.
2. Splitting latency (plain demand plus stall) from capacity (held demand plus stall) gives 3.6% over the design grid against 4.7% for plain MVA, but it was chosen after seeing that grid.
3. On the held-out mix it ties plain MVA (3.4% against 3.5%) and still underestimates by up to 8% at moderate load.

## Limitations
One class, one arm, no travel, independent failures, illustrative times, small held-out set. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Little (1961). Not re-checked online in this run.
