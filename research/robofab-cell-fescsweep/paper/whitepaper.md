# The error of a flow-equivalent-server decomposition of a robot-printer cell peaks where the inspector and the subsystem are matched

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
`robofab-cell-fesc` found a mean error of 0.32% for a Norton / flow-equivalent-server decomposition (Chandy, Herzog and Woo 1975; Bolch et al. 2006) of a cell of one arm, P printers held through load and unload, and one inspector, at one inspection time. Is that figure typical across inspector speeds?

## Setup
Ten cells (print 20 or 60 min, 2/4/6 printers, N = P+2 and 2P, Erlang-4 print), inspection time 0.1 to 100 min on a 19-point grid, decomposition against the exact Markov chain. Knee t* = 1/H(N). See `README.md`.

## Findings (all in `experiments/results.txt`)
1. Peak error −2.18% to −5.00% (mean −3.24%), about ten times the earlier mean.
2. Error is 0.000% at 0.1 min inspection and at most 0.52% at 100 min.
3. The peak lies at 0.81 to 0.99 t* (median 0.92), on a coarse grid.
4. No positive error beyond rounding; smaller cells err more (2 printers: 5.0%, 4.7%).
5. The correlation explanation is untested.

## Limitations
One job class, exponential load, unload and inspect, unload priority, illustrative times, one print variability, grid-limited peaks. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Chandy, Herzog and Woo (1975). Not re-checked online in this run.
