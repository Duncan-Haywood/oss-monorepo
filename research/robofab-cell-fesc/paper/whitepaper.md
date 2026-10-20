# A flow-equivalent-server decomposition predicts a robot-printer cell's throughput to 0.3% without enumerating its states

*Produced with AI assistance (Claude). Stylised, simulation-only; no physical cell was built or measured.*

## Question
Mean value analysis (Reiser and Lavenberg 1980) of a closed cell of one arm, P printers held through load and unload, and one inspection station errs by up to 20% against an exact Markov chain, because of the cell's structure (`robofab-cell-ctmc`). Does a Norton / flow-equivalent-server decomposition (Chandy, Herzog and Woo 1975; Bolch et al. 2006) repair it?

## Setup
Solve the arm-and-printers subsystem exactly at each fixed population, short-circuited; replace it by a load-dependent exponential server; solve the resulting two-station birth-death chain. Compare with the exact full chain and two MVA variants on 42 settings (print 20 or 60 min, 2 to 6 printers, work in process P, P+2, 2P, Erlang-1/4/9 print time), plus 5 cells of 8 to 12 printers. See `README.md`.

## Findings (all in `experiments/results.txt`)
1. Mean absolute error 0.32%, maximum 1.57%, over the 42 settings; plain MVA 6.77% (max 20.29%), held MVA 4.34% (max 12.20%).
2. Error is smallest at N = P (0.12%) and N = 2P (0.23%), largest as printers start to queue (0.77% at N = P+2).
3. The error is negative in 38 of 42 settings (mean −0.32%): the decomposition is not exact because the cell is not product form.
4. In 5 larger cells (up to 17,919 exact states) the error is −0.09% to −0.31%. The largest subsystem chain is about a tenth the size of the full chain; at these sizes both solve in under a second.

## Limitations
One class, one arm, exponential load, unload and inspect, unload priority, illustrative times; the reference is a single published-in-repo chain. Stylised and simulation-only.

## References
`refs.bib`: Reiser and Lavenberg (1980); Bolch et al. (2006); Chandy, Herzog and Woo (1975). Not re-checked online in this run.
