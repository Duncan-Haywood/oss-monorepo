# Held-printer demand as a repair for mean value analysis of a robot-printer cell: a mixed result

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Does adding the arm's load and unload time to the printer's service demand make mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) a better predictor of throughput in a closed arm-printers-inspection cell where printers are held through load and unload?

## Setup
See `README.md` (Method). Simulation code copied from `robofab-cell-cv`. Lognormal times with cv 0.3 and 1.0, 4 to 16 printers, work in process P/2, P, P+2 and 2P, 20 seeds per row, 32 rows.

## Findings (all in `experiments/results.txt`)
1. Mean absolute error over all rows: plain MVA 4.7%, held-demand MVA 6.2%, plain bound 8.0%, held-demand bound 5.5%.
2. At work in process 2P (8 rows) held-demand MVA is better (2.9% against 8.2%); on the other 24 rows it is worse (7.3% against 3.6%).
3. The repair is therefore load-dependent and not a general improvement.

## Limitations
One class, one arm, no travel, independent failures, illustrative times, two cv values. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Little (1961). Not re-checked online in this run.
