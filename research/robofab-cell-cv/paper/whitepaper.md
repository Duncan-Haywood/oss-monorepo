# Variability and printer stall in a queueing model of a robot-printer-inspection cell

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
How do the errors of mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) and of a utilisation bound depend on service-time variability in a closed arm-printers-inspection cell with printers held through load and unload, and how much of the saturated-throughput gap is explained by printers waiting for the arm?

## Setup
See `README.md` (Method). A copy of the `robofab-cell-mva` simulation, instrumented for stall. Lognormal times with cv 0 to 2, 4 to 16 printers, 20 seeds per row.

## Findings (all in `experiments/results.txt`)
1. At 12 printers MVA's error moves from −6.2% (cv 0) through zero near cv 1 to +8.4% (cv 2); the bound's error stays between +8.2% and +25.0%.
2. At 16 printers the arm is the bottleneck; the bound is closer than MVA for cv up to about 0.6 and farther for cv 1 and above.
3. At 8 printers, stall rises from 0.1% to 4.6% with work in process and saturates there.
4. Held-printer capacity times (1 − stall) matches the saturated simulated rate at 4 and 8 printers (4.44 and 8.59 against 4.35 ± 0.05 and 8.56 ± 0.09), is 2.4% high at 12, and does not apply at 16 where the arm limits.

## Limitations
One class, one arm, no travel, independent failures, illustrative times; the accounting is not an independent validation. Stylised, simulation-only.

## References
`refs.bib`. Not re-checked online in this run.
