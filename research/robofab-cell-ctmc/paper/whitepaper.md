# Structure, not variability, drives the error of queueing analysis of a robot-printer cell: an exact Markov-chain reference

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
In a closed cell of one arm, P printers held through load and unload, and one inspection station, is the error of mean value analysis (Reiser and Lavenberg 1980; Bolch et al. 2006) caused by non-exponential print times or by the cell's structure?

## Setup
Exact continuous-time Markov chain with Erlang-k print time (cv = 1/√k) and exponential load, unload and inspect times; unload-priority arm; stationary distribution by uniformisation. Checked against an independent simulation. Print 20 or 60 min, 2 to 6 printers, work in process P, P+2, 2P, k = 1, 4, 9 (42 settings). See `README.md`.

## Findings (all in `experiments/results.txt`)
1. The chain matches simulation in 10 settings (largest |z| 1.73), and a lognormal print time of equal cv in 4 more (|z| ≤ 0.98).
2. Changing print-time cv from 1 to 0.33 moves the exact throughput by at most 0.71%.
3. Plain MVA is within 0.6% at N = P and overshoots up to +20.3% beyond; mean absolute error 3.0% (N < 2P) and 12.8% (N = 2P).
4. Held-demand MVA errs 2.8% at N = 2P, 5.3% below it, and −5.2% to −12.2% at N = P (double counting).

## Limitations
One class, one arm, exponential load, unload and inspect, unload priority, illustrative times. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Little (1961). Not re-checked online in this run.
