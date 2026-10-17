# Exact queueing analysis against a utilisation bound for a robot-arm, 3D-printer and inspection cell

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Can mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) of a closed arm-printers-inspection network predict the throughput of a discrete-event twin better than a utilisation bound, and which departures from product form hurt it?

## Setup
See `README.md` (Method). Two job types, equal mix, closed loop with fixed work in process, 20 seeds per row. A simulation with a product-form-compatible mode and a printer-holding mode, and exponential, deterministic or lognormal (cv 0.3) times, adds one departure at a time.

## Findings (all in `experiments/results.txt`)
1. The MVA code reproduces the exact Markov-chain solution on small networks and a product-form simulation within sampling error (one of five single-type rows is 2.3 standard errors off).
2. With exponential times and two job types, MVA is within −6.3% to +3.9% of simulation (1 to 8 printers).
3. Less variable service raises simulated throughput above MVA: at 12 printers MVA is 8.2% (lognormal) and 10.9% (deterministic) low.
4. With the real printer-holding semantics, MVA's absolute error is smaller than the bound's at 4, 8 and 12 printers (7.2, 2.5, 5.2% against 10.9, 17.4, 9.3%) and not at 16 (3.8% against 0.8%).
5. At high work in process MVA does not saturate where the simulation does (9.79 against 8.56 ± 0.09 parts/h at 8 printers, work in process 20).

## Limitations
One class, one arm, no travel, independent failures, illustrative times; the cause in finding 5 is a conjecture. Stylised, simulation-only.

## References
`refs.bib`. Not re-checked online in this run.
