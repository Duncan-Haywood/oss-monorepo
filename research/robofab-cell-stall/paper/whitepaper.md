# An arm-wait-aware printer demand does not repair mean value analysis of a robot-printer cell: a negative result

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Does adding the arm's queueing delay to the held printer's service demand, found as a fixed point, make mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) a better predictor of throughput in a closed arm-printers-inspection cell?

## Setup
See `README.md` (Method). Code copied from `robofab-cell-held`. Lognormal times with cv 0.3 and 1.0, 4 to 16 printers, work in process P/2, P, P+2, 2P, 20 seeds per row, 32 rows.

## Findings (all in `experiments/results.txt`)
1. Mean absolute error over all rows: plain MVA 4.7%, held-demand MVA 6.2%, stall-aware MVA 7.9%, full-wait variant 10.6%.
2. At work in process 2P (8 rows): plain 8.2%, held 2.9%, stall-aware 3.1%. On the other 24 rows: plain 3.6%, held 7.3%, stall-aware 9.5%.
3. The stall-aware model underpredicts in nearly every row. A plausible reason (untested) is that the wait is double counted where printers are not the bottleneck.

## Limitations
One class, one arm, no travel, illustrative times, two cv values, one heuristic for the wait. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Little (1961). Not re-checked online in this run.
