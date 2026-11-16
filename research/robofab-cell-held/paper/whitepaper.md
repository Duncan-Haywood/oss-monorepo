# Held-printer demand as a repair for mean value analysis of a robot-printer cell: a mixed result

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Does adding the arm's load and unload time to the printer's service demand make mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) a better predictor of throughput in a closed arm-printers-inspection cell where printers are held through load and unload?

## Setup
See `README.md` (Method). Simulation code copied from `robofab-cell-cv`. Lognormal times with cv 0.3 and 1.0, 4 to 16 printers, work in process P/2, P, P+2 and 2P, 20 seeds per row, 32 rows.

## Findings (all in `experiments/results.txt`)
1. Mean absolute error over the 28 distinct settings (four of the 32 grid rows repeat another exactly): plain MVA 4.9%, held-demand MVA 5.6%, plain bound 8.6%, held-demand bound 5.6% (32-row averages with the repeats: 4.7%, 6.2%, 8.0%, 5.5%).
2. At work in process 2P (8 rows) held-demand MVA is better (2.9% against 8.2%); on the other 20 distinct rows it is worse (6.7% against 3.6%; 7.3% against 3.6% over all 24 printed rows). The holding is simultaneous resource possession (Jacobson and Lazowska 1982), for which surrogate-delay, Norton (Chandy, Herzog and Woo 1975) and Marie (1979) approximations exist; this note does not compare against them.
3. The repair is therefore load-dependent and not a general improvement.

## Limitations
One class, one arm, no travel, independent failures, illustrative times, two cv values. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Little (1961); Chandy, Herzog and Woo (1975); Marie (1979); Jacobson and Lazowska (1982). Marie and Jacobson-Lazowska were checked by web search on 2026-11-16; the others were not re-checked online.
